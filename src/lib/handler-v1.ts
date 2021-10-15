import { CorsConfig, Logger, RouterConfig } from "./types";
import Ajv from "ajv";
import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyHandler,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import {
  parsePathParams,
  parseQueryParams,
  PathParamRegex,
} from "./path-param-parser";
import { APIGatewayVersion, RouteHandlers } from "./router";
import * as FP from "fp-ts";
import { toOpenApiPart } from "./open-api";
import { logRequestResponse } from "./logging";
import { isLeft } from "fp-ts/lib/These";

const ajv = new Ajv({ strict: false });

const buildCorsHeaders = (
  req: APIGatewayProxyEventHeaders,
  cfg: CorsConfig
) => ({
  "Access-Control-Allow-Headers":
    cfg.allowHeaders === "*" ? "*" : cfg.allowHeaders.join(", "),
  "Access-Control-Allow-Origin": Array.isArray(cfg.allowOrigin)
    ? cfg.allowOrigin.indexOf(req && req["origin"]!) > -1
      ? req["origin"]
      : "null"
    : cfg.allowOrigin,
  "Access-Control-Allow-Methods":
    cfg.allowMethods === "*" ? "*" : cfg.allowMethods.join(", "),
  "Access-Control-Allow-Credentials": cfg.allowCredentials.toString(),
});

export type ApiGatewayHandlerWithOpenApi = APIGatewayProxyHandler & {
  toOpenApiPart: () => object;
};

export type ApiGatewayHandlerV2WithOpenApi = APIGatewayProxyHandlerV2 & {
  toOpenApiPart: () => object;
};

export type VersionedHandlerType<V extends APIGatewayVersion> = V extends "V1"
  ? ApiGatewayHandlerWithOpenApi
  : ApiGatewayHandlerV2WithOpenApi;

export const APIEventHandler: (
  routes: RouteHandlers<"V1">,
  config?: RouterConfig
) => VersionedHandlerType<"V1"> = ({ handlers }, cfg) => {
  const handler: ApiGatewayHandlerWithOpenApi = (event, ctx) => {
    const { logger, corsConfig } = cfg || {};
    logRequestResponse(event, cfg);
    const thisCorsConfig: CorsConfig | undefined =
      corsConfig === true
        ? {
            allowCredentials: true,
            allowHeaders: "*",
            allowOrigin: "*",
            allowMethods: "*",
          }
        : corsConfig;
    const route = handlers
      .filter((h) => event.httpMethod.toLowerCase() === h.method.toLowerCase())
      .filter((h) => {
        const handlerSegments = h.url.split("?")[0].split("/");
        const routeSegments = event.path.split("?")[0].split("/");
        return (
          handlerSegments.length === routeSegments.length &&
          handlerSegments.every(
            (hs, ix) => hs === routeSegments[ix] || PathParamRegex.test(hs)
          )
        );
      })[0];
    const corsHeaders = thisCorsConfig
      ? buildCorsHeaders(event.headers, thisCorsConfig)
      : {};
    if (route) {
      const path = route.url.split("?")[0];
      const query = route.url.split("?")[1];
      const pathParams = parsePathParams(decodeURIComponent(event.path), path);
      const queryParams =
        event.queryStringParameters || event.multiValueQueryStringParameters
          ? parseQueryParams(
              event.queryStringParameters || {},
              event.multiValueQueryStringParameters || {},
              query
            )
          : FP.either.right({});
      const bodyObj = event.body ? JSON.parse(event.body) : null;
      const isValidBody = route.body ? ajv.validate(route.body, bodyObj) : true;
      if (isValidBody) {
        const tupled = FP.function.pipe(
          pathParams,
          FP.either.chain((p) =>
            FP.function.pipe(
              queryParams,
              FP.either.map((qp) => [p, qp] as const)
            )
          )
        );
        if (FP.either.isRight(tupled)) {
          return route
            .handler(
              {
                pathParams: tupled.right[0],
                queryParams: tupled.right[1],
                body: bodyObj,
                response: (sc, bod, h) =>
                  Promise.resolve({
                    statusCode: sc,
                    body: bod,
                    headers: h,
                  }),
              },
              {
                originalEvent: event,
                context: ctx,
              }
            )
            .then((r) => ({
              statusCode: r.statusCode,
              body: r.body ? JSON.stringify(r.body) : "",
              headers: {
                ...corsHeaders,
                ...{ "content-type": "application/json" },
                ...cfg?.defaultHeaders,
                ...r.headers,
              },
            }))
            .then((r) => {
              logRequestResponse(r);
              return r;
            });
        } else {
          logger &&
            logger.info(`Unresolvable route`, {
              body: event.body,
              path: event.path,
              query: event.queryStringParameters,
              headers: event.headers,
            });
          return Promise.resolve({
            statusCode: isLeft(pathParams) || isLeft(queryParams) ? 400 : 404,
            body: JSON.stringify({
              message:
                isLeft(pathParams) || isLeft(queryParams)
                  ? "Bad Request"
                  : "Not Found",
            }),
            headers: corsHeaders,
          }).then((r) => {
            logRequestResponse(r);
            return r;
          });
        }
      } else {
        logger &&
          logger.info(`Request body does not much expected schema`, {
            body: event.body,
            path: event.path,
            query: event.queryStringParameters,
            headers: event.headers,
          });
        return Promise.resolve({
          statusCode: 400,
          body: JSON.stringify({ message: "Bad request" }),
          headers: corsHeaders,
        }).then((r) => {
          logRequestResponse(r);
          return r;
        });
      }
    } else {
      logger &&
        logger.info(`Unresolvable route`, {
          body: event.body,
          path: event.path,
          query: event.queryStringParameters,
          headers: event.headers,
        });
      return Promise.resolve({
        statusCode: 404,
        body: JSON.stringify({ message: "Not found" }),
        headers: corsHeaders,
      }).then((r) => {
        logRequestResponse(r);
        return r;
      });
    }
  };

  handler.toOpenApiPart = () => toOpenApiPart(handlers);

  return handler;
};
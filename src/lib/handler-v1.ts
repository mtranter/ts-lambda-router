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
import { ApiInfo, SecurityScheme, toOpenApi } from "./open-api";
import { logRequestResponse } from "./logging";
import { isLeft } from "fp-ts/lib/These";

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
  toOpenApi: (
    apiInfo: ApiInfo,
    functionArn: string,
    iamRoleArn?: string,
    securitySchemes?: {
      [k: string]: SecurityScheme;
    }
  ) => object;
};

export type ApiGatewayHandlerV2WithOpenApi = APIGatewayProxyHandlerV2 & {
  toOpenApi: (
    apiInfo: ApiInfo,
    functionArn: string,
    iamRoleArn?: string,
    securitySchemes?: {
      [k: string]: SecurityScheme;
    }
  ) => object;
};

export type VersionedHandlerType<V extends APIGatewayVersion> = V extends "V1"
  ? ApiGatewayHandlerWithOpenApi
  : ApiGatewayHandlerV2WithOpenApi;

const fromBase64 = (data: string) => {
  const buff = Buffer.from(data, "base64");
  return buff.toString("utf-8");
};

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
      const [path, ...tail] = route.url.split("?");
      const query = tail.join("");
      const pathParams = parsePathParams(decodeURIComponent(event.path), path);
      const queryParams =
        (event.queryStringParameters ||
          event.multiValueQueryStringParameters) &&
        query
          ? parseQueryParams(
              event.queryStringParameters || {},
              event.multiValueQueryStringParameters || {},
              query
            )
          : FP.either.right({});
      const bodyObj = event.body
        ? JSON.parse(
            event.isBase64Encoded ? fromBase64(event.body) : event.body
          )
        : null;
      if (route.bodyValidator?.errors) {
        route.bodyValidator.errors = null;
      }
      const isValidBody = route.bodyValidator
        ? route.bodyValidator(bodyObj)
        : true;
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
            errors: route.bodyValidator?.errors,
            path: event.path,
            query: event.queryStringParameters,
            headers: event.headers,
          });
        return Promise.resolve({
          statusCode: 400,
          body: JSON.stringify({
            message: "Bad request",
            errors: route.bodyValidator?.errors,
          }),
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

  handler.toOpenApi = (
    apiInfo: ApiInfo,
    functionArn: string,
    iamRoleArn?: string,
    securitySchemes?: {
      [k: string]: SecurityScheme;
    }
  ) =>
    toOpenApi(
      handlers,
      "1.0",
      apiInfo,
      functionArn,
      iamRoleArn,
      securitySchemes
    );

  return handler;
};

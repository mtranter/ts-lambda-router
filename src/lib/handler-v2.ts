import { CorsConfig, Logger, RouterConfig } from "./types";
import Ajv from "ajv";
import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import {
  parsePathParams,
  parseQueryParams,
  PathParamRegex,
} from "./path-param-parser";
import { RouteHandlers } from "./router";
import * as FP from "fp-ts";
import { ApiInfo, SecurityScheme, toOpenApi } from "./open-api";
import { logRequestResponse, logRequestResponsev2 } from "./logging";
import { isLeft } from "fp-ts/lib/These";
import { VersionedHandlerType } from "./handler-v1";

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

export type ApiGatewayHandlerWithOpenApi = APIGatewayProxyHandlerV2 & {
  toOpenApi: (apiInfo: ApiInfo, functionArn: string) => object;
};

export const APIEventHandlerV2: (
  routes: RouteHandlers<"V2">,
  config?: RouterConfig
) => VersionedHandlerType<"V2"> = ({ handlers }, cfg) => {
  const handler: ApiGatewayHandlerWithOpenApi = (event, ctx) => {
    const { logger, corsConfig } = cfg || {};
    logRequestResponsev2(event, cfg);
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
      .filter(
        (h) =>
          event.requestContext.http.method.toLowerCase() ===
          h.method.toLowerCase()
      )
      .filter((h) => {
        const handlerSegments = h.url.split("?")[0].split("/");
        const routeSegments = event.rawPath.split("?")[0].split("/");
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
      const query = event.rawQueryString;
      const pathParams = parsePathParams(
        decodeURIComponent(event.rawPath),
        path
      );
      const queryParams = event.queryStringParameters
        ? parseQueryParams(event.queryStringParameters || {}, {}, query)
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
              path: event.rawPath,
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
            path: event.rawPath,
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
          path: event.rawPath,
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
      "2.0",
      apiInfo,
      functionArn,
      iamRoleArn,
      securitySchemes
    );

  return handler;
};

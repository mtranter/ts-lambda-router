import { CorsConfig, Logger, RouterConfig } from "./types";
import Ajv from "ajv";
import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyHandler,
} from "aws-lambda";
import {
  parsePathParams,
  parseQueryParams,
  PathParamRegex,
} from "./path-param-parser";
import { RouteHandlers } from "./router";
import * as FP from "fp-ts";

const ajv = new Ajv({ strict: false });

const buildCorsHeaders = (
  req: APIGatewayProxyEventHeaders,
  cfg: CorsConfig
) => ({
  "Access-Control-Allow-Headers":
    cfg.allowHeaders === "*" ? "*" : cfg.allowHeaders.join(", "),
  "Access-Control-Allow-Origin": Array.isArray(cfg.allowOrigin)
    ? cfg.allowOrigin.indexOf(req["origin"]!) > -1
      ? req["origin"]
      : ""
    : cfg.allowOrigin,
  "Access-Control-Allow-Methods":
    cfg.allowMethods === "*" ? "*" : cfg.allowMethods.join(", "),
  "Access-Control-Allow-Credentials": cfg.allowCredentials.toString(),
});

export const APIEventHandler: (
  routes: RouteHandlers,
  config?: RouterConfig
) => APIGatewayProxyHandler =
  ({ handlers }, cfg) =>
  (event, ctx) => {
    const { logger, corsConfig } = cfg || {};
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
      const pathParams = parsePathParams(event.path, path);
      const queryParams = event.queryStringParameters
        ? parseQueryParams(event.queryStringParameters, query)
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
              },
              {
                originalEvent: event,
                context: ctx,
              }
            )
            .then((r) => ({ ...r, headers: { ...corsHeaders, ...r.headers } }));
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
            body: "Bad Request",
            headers: corsHeaders,
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
          body: "Bad Request",
          headers: corsHeaders,
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
        body: "Not Found",
        headers: corsHeaders,
      });
    }
  };

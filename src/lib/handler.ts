import { Logger } from "./types";
import Ajv from "ajv";
import { APIGatewayProxyHandler } from "aws-lambda";
import {
  parsePathParams,
  parseQueryParams,
  PathParamRegex,
} from "./path-param-parser";
import { RouteHandlers } from "./router";
import * as FP from "fp-ts";

const ajv = new Ajv({ strict: false });
export const APIEventHandler: (
  routes: RouteHandlers,
  logger?: Logger
) => APIGatewayProxyHandler =
  ({ handlers }, logger) =>
  (event, ctx) => {
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
          return route.handler(
            {
              pathParams: tupled.right[0],
              queryParams: tupled.right[1],
              body: bodyObj,
            },
            {
              originalEvent: event,
              context: ctx,
            }
          );
        } else {
          logger &&
            logger.info(`Unresolvable route`, {
              body: event.body,
              path: event.path,
              query: event.queryStringParameters,
              headers: event.headers
            });
          return Promise.resolve({
            statusCode: 404,
            body: "Bad Request",
          });
        }
      } else {
        logger &&
          logger.info(`Request body does not much expected schema`, {
            body: event.body,
            path: event.path,
            query: event.queryStringParameters,
            headers: event.headers
          });
        return Promise.resolve({
          statusCode: 400,
          body: "Bad Request",
        });
      }
    } else {
      logger &&
        logger.info(`Unresolvable route`, {
          body: event.body,
          path: event.path,
          query: event.queryStringParameters,
          headers: event.headers
        });
      return Promise.resolve({
        statusCode: 404,
        body: "Not Found",
      });
    }
  };

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { Request } from "./types";
import { Static, TSchema, Type } from "@sinclair/typebox";

type AnyRequest<TBody> = {
  pathParams: any;
  queryParams: any;
  body: TBody;
  response: (statusCode: number, body: any, handlers?: Record<string, string>) => Promise<Response<any, any>>;
};

export type RouteHandlerDefinition = {
  method: string;
  url: string;
  body?: TSchema;
  responses: Responses;
  handler: (
    req: AnyRequest<any>,
    apiParams: { originalEvent: APIGatewayProxyEvent; context: Context }
  ) => Promise<Response<any, any>>;
};

type HttpMethod<R, M extends HTTPMethod> = <
  A extends string,
  S extends NumericKeysOf<Resp>,
  B extends TSchema = never,
  Resp extends Responses = typeof DefaultResponses
>(
  path: A,
  bodyOrResponses?: M extends HTTPRead ? Resp : B,
  responses?: M extends HTTPRead ? never : Resp
) => (
  handler: (
    req: Request<A, Static<B>, Resp>,
    originalEvent: { originalEvent: APIGatewayProxyEvent; context: Context }
  ) => Promise<Response<Resp, S>>
) => Router<R>;

export type Router<R> = R & {
  get: HttpMethod<R, "get">;
  head: HttpMethod<R, "head">;
  options: HttpMethod<R, "options">;
  post: HttpMethod<R, "post">;
  put: HttpMethod<R, "put">;
  delete: HttpMethod<R, "delete">;
};

export type RouteHandlers = { handlers: readonly RouteHandlerDefinition[] };

type HTTPRead = "get" | "options" | "head";
type HTTPWrite = "post" | "put" | "delete";
type HTTPMethod = HTTPRead | HTTPWrite;

type NumericKeysOf<T> = number &
  keyof { [I in keyof T]: T[I] extends number ? I : never };
export type Responses = { [K: number]: TSchema };

export type Response<R extends Responses, Status extends number> = {
  statusCode: Status;
  headers?: {
    [header: string]: boolean | number | string;
  };
  body: Static<R[Status]>;
};

const AnyType = Type.Union([Type.Dict(true as any), Type.String()]);
const DefaultResponses = {
  200: AnyType,
  201: AnyType,
  400: AnyType,
  404: AnyType,
  500: AnyType,
};

export const Router = (
  handlers: readonly RouteHandlerDefinition[] = []
): Router<RouteHandlers> => {
  const buildHandler =
    <M extends HTTPMethod>(method: M): HttpMethod<RouteHandlers, M> =>
    <
      A extends string,
      B extends TSchema,
      S extends number,
      R extends Responses = typeof DefaultResponses
    >(
      path: A,
      bodyOrResponses?: M extends HTTPRead ? R : B,
      responses?: M extends HTTPRead ? never : R
    ) =>
    (
      handler: (
        req: Request<A, Static<B>, R>,
        originalEvent: { originalEvent: APIGatewayProxyEvent; context: Context }
      ) => Promise<Response<R, S>>
    ) => {
      const isSafe = ["get", "options", "head"].includes(method);
      const body = isSafe ? undefined : (bodyOrResponses as TSchema);
      const _responses = isSafe ? (bodyOrResponses as R) : responses;
      return Router([
        {
          method,
          url: path,
          handler,
          body,
          responses: _responses || DefaultResponses,
        },
        ...handlers,
      ]);
    };
  return {
    handlers,
    get: buildHandler("get"),
    head: buildHandler("head"),
    options: buildHandler("options"),
    post: buildHandler("post"),
    put: buildHandler("put"),
    delete: buildHandler("delete"),
  };
};

import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  Context,
} from "aws-lambda";
import { ExtractSchema, Request } from "./types";
import { Static, TAny, TSchema, Type } from "@sinclair/typebox";
import { Middleware, HandlerFunction } from "./middleware";

type AnyRequest<TBody> = {
  pathParams: any;
  queryParams: any;
  body: TBody;
  response: (
    statusCode: number,
    body: any,
    handlers?: Record<string, string>
  ) => Promise<Response<any, any>>;
};

export type RouteHandlerDefinition = {
  method: string;
  url: string;
  body?: TSchema;
  responses: Responses;
  useIamAuth: boolean;
  security?: {
    scheme: string;
    scopes: string[];
  };
  handler: (
    req: AnyRequest<any>,
    apiParams: {
      originalEvent: APIGatewayProxyEvent;
      context: Context;
    }
  ) => Promise<Response<any, any>>;
};

type RouteConfig<Resp extends Responses> = {
  responsesSchema?: Resp;
  useIamAuth?: boolean;
  security?: {
    scheme: string;
    scopes: string[];
  };
};

type HandlerInput<
  Url extends string,
  B extends TSchema,
  Resp extends Responses
> = {
  req: Request<Url, Static<B>, Resp>;
  originalEvent: { originalEvent: APIGatewayProxyEvent; context: Context };
};

type HttpMethod<R, M extends HTTPMethod> = <
  A extends string,
  S extends StatusCode,
  B extends TSchema = never,
  Resp extends Responses = AnyType
>(
  path: A,
  bodyOrConfig?: M extends HTTPRead ? RouteConfig<Resp> : B,
  config?: M extends HTTPRead ? never : RouteConfig<Resp>
) => (
  handler:
    | HttpHandler<A, B, Resp, S>
    | HandlerFunction<HttpHandler<A, B, Resp, S>>
) => Router<R>;

export type Router<R> = R & {
  compose: (other: Router<R>) => Router<R>;
  get: HttpMethod<R, "get">;
  head: HttpMethod<R, "head">;
  options: HttpMethod<R, "options">;
  post: HttpMethod<R, "post">;
  put: HttpMethod<R, "put">;
  delete: HttpMethod<R, "delete">;
};

export type RouteHandlers = {
  handlers: readonly RouteHandlerDefinition[];
};

type HTTPRead = "get" | "options" | "head";
type HTTPWrite = "post" | "put" | "delete";
type HTTPMethod = HTTPRead | HTTPWrite;

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
export type Responses = RequireAtLeastOne<{ [k in StatusCode]: TSchema }>;

export type Response<R extends Responses, Status extends StatusCode> = {
  statusCode: Status;
  headers?: {
    [header: string]: boolean | number | string;
  };
  body: Status extends keyof R ? ExtractSchema<R[Status]> : any;
};

const StatusCodes = [
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304,
  305, 306, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410,
  411, 412, 413, 414, 415, 416, 417, 418, 420, 422, 423, 424, 425, 426, 428,
  429, 431, 444, 449, 450, 451, 499, 500, 501, 502, 503, 504, 505, 506, 507,
  508, 509, 510, 511, 598, 599,
] as const;
export type StatusCode = typeof StatusCodes[number] & number;
export type AnyType = Record<StatusCode, TAny>;
const DefaultResponses = {
  200: Type.Any({
    description: "OK",
  }),
};

export type HttpHandler<
  Url extends string,
  Body extends TSchema,
  Resp extends Responses,
  Status extends StatusCode,
  Extension = {}
> = Middleware<HandlerInput<Url, Body, Resp> & Extension, Response<Resp, Status>>;

export const Router = (
  handlers: readonly RouteHandlerDefinition[] = []
): Router<RouteHandlers> => {
  const buildHandler =
    <M extends HTTPMethod>(method: M): HttpMethod<RouteHandlers, M> =>
    <
      A extends string,
      B extends TSchema,
      S extends StatusCode,
      R extends Responses = AnyType
    >(
      path: A,
      bodyOrConfig?: M extends HTTPRead ? RouteConfig<R> : B,
      configOrNothing?: M extends HTTPRead ? never : RouteConfig<R>
    ) =>
    (
      handler:
        | HttpHandler<A, B, R, S>
        | HandlerFunction<HttpHandler<A, B, R, S>>
    ) => {
      const isSafe = ["get", "options", "head"].includes(method);
      const body = isSafe ? undefined : (bodyOrConfig as TSchema);
      const config: RouteConfig<R> = (
        isSafe ? bodyOrConfig : configOrNothing
      ) as RouteConfig<R>;
      const responses = config?.responsesSchema || DefaultResponses;
      return Router([
        {
          method,
          url: path,
          handler: (req, originalEvent) =>
            typeof handler === "function"
              ? handler({ req, originalEvent })
              : handler.run({ req, originalEvent }),
          body,
          responses,
          useIamAuth: !!config?.useIamAuth,
          security: config?.security,
        },
        ...handlers,
      ]);
    };
  return {
    handlers,
    compose: (other) => Router([...handlers, ...other.handlers]),
    get: buildHandler("get"),
    head: buildHandler("head"),
    options: buildHandler("options"),
    post: buildHandler("post"),
    put: buildHandler("put"),
    delete: buildHandler("delete"),
  };
};

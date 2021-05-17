import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Request } from './types';
import { Static } from '@sinclair/typebox';

type AnyRequest<TBody> = {
  pathParams: any;
  queryParams: any;
  body: TBody;
};

type RouteHandlerDefinition = {
  method: string;
  url: string;
  body?: any;
  handler: (
    req: AnyRequest<any>,
    apiParams: { originalEvent: APIGatewayProxyEvent; context: Context }
  ) => Promise<APIGatewayProxyResult>;
};

type HttpMethod<R, M extends HTTPMethod> = <A extends string, B = never>(
  path: A,
  body?: M extends HTTPRead ? never : B
) => (
  handler: (
    req: Request<A, Static<B>>,
    originalEvent: { originalEvent: APIGatewayProxyEvent; context: Context }
  ) => Promise<APIGatewayProxyResult>
) => Router<R>;

export type Router<R> = R & {
  get: HttpMethod<R, 'get'>;
  head: HttpMethod<R, 'head'>;
  options: HttpMethod<R, 'options'>;
  post: HttpMethod<R, 'post'>;
  put: HttpMethod<R, 'put'>;
  delete: HttpMethod<R, 'delete'>;
};

export type RouteHandlers = { handlers: readonly RouteHandlerDefinition[] };

type HTTPRead = 'get' | 'options' | 'head';
type HTTPWrite = 'post' | 'put' | 'delete';
type HTTPMethod = HTTPRead | HTTPWrite;

export const Router = (handlers: readonly RouteHandlerDefinition[] = []): Router<RouteHandlers> => {
  const buildHandler = <M extends HTTPMethod>(method: M): HttpMethod<RouteHandlers, M> => <A extends string, B>(
    path: A,
    body?: M extends HTTPRead ? never : B
  ) => (
    handler: (
      req: Request<A, Static<B>>,
      originalEvent: { originalEvent: APIGatewayProxyEvent; context: Context }
    ) => Promise<APIGatewayProxyResult>
  ) => Router([{ method, url: path, handler, body }, ...handlers]);

  return {
    handlers,
    get: buildHandler('get'),
    head: buildHandler('head'),
    options: buildHandler('options'),
    post: buildHandler('post'),
    put: buildHandler('put'),
    delete: buildHandler('delete'),
  };
};

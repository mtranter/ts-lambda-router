/* eslint-disable @typescript-eslint/ban-types */

import { Static } from "@sinclair/typebox";
import { PathParamParser, PathParamParsers } from "./path-param-parser";
import { Responses, Response } from "./router";

export type Logger = {
  info: (msg: string, metadata?: object) => void;
};

export type CorsConfig = {
  allowHeaders: "*" | string[];
  allowOrigin: string | string[];
  allowMethods: "*" | string[];
  allowCredentials: boolean;
};

export type RouterConfig = {
  logger?: Logger;
  logConfig?: {
    logger?: Logger;
    logRequests?: boolean;
    logResponses?: boolean;
    logRequestBody?: boolean;
    logResponseBody?: boolean;
    ignoredHeaders?: string[];
  };
  defaultHeaders?: Record<string, string>;
  corsConfig?: true | CorsConfig;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
type _<T> = T;
export type Merge<T> = _<{ [k in keyof T]: T[k] }>;
export type Trim<T> = T extends `/${infer Rest}${"/" | ""}` ? Trim<Rest> : T;

type TypeOfParser<T> = T extends PathParamParser<infer A> ? A : never;
type ParserType<T extends keyof PathParamParsers> = TypeOfParser<
  PathParamParsers[T]
>;

type PathParam<S extends string> = S extends `${infer Var}:${infer VarType}`
  ? VarType extends keyof PathParamParsers
    ? { readonly [key in Var]: ParserType<VarType> }
    : never
  : S extends `${infer Var}`
  ? { readonly [key in Var]: string }
  : never;

type PathParams<
  A extends string,
  Seed = {}
> = A extends `{${infer AA}}${infer Tail}`
  ? Merge<Seed & PathParam<AA> & PathParams<Tail>>
  : A extends `${infer _}{${infer AA}}${infer Tail}`
  ? Merge<Seed & PathParam<AA> & PathParams<Tail>>
  : A extends `${infer _}{${infer AA}}`
  ? Merge<Seed & PathParam<AA>>
  : Seed;

type UrlParam<
  S extends string,
  P = string
> = S extends `${infer Var}:${infer VarType}`
  ? VarType extends keyof PathParamParsers
    ? UrlParam<Var, ParserType<VarType>>
    : never
  : S extends `${infer Var}?`
  ? { readonly [key in Var]?: P }
  : S extends `${infer Var}`
  ? { readonly [key in Var]: P }
  : never;

type QueryParams<
  A extends string,
  Seed = {}
> = A extends `{${infer AA}}${infer Tail}`
  ? Merge<Seed & UrlParam<AA> & QueryParams<Tail>>
  : Seed;

export type Request<Url extends string, Body, R extends Responses> = {
  pathParams: Url extends `${infer P}?${infer _}`
    ? PathParams<P>
    : PathParams<Url>;
  queryParams: Url extends `${infer _}?${infer Q}` ? QueryParams<Q> : never;
  body: Body;
  response: <S extends keyof R & number>(
    s: S,
    body: Static<R[S]>,
    headers?: Record<string, string>
  ) => Promise<Response<R, S>>;
};

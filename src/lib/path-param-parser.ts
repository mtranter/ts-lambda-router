import matchAll from "string.prototype.matchall";
import {
  APIGatewayProxyEventMultiValueQueryStringParameters,
  APIGatewayProxyEventPathParameters,
  APIGatewayProxyEventQueryStringParameters,
} from "aws-lambda";
import {
  Either,
  left,
  right,
  getApplicativeValidation,
} from "fp-ts/lib/Either";
import * as E from "fp-ts/Either";
import * as L from "fp-ts/Array";
import * as FP from "fp-ts";
import { Semigroup } from "fp-ts/lib/Semigroup";

export type ParserError = { errors: string[] };
export type PathParamParser<T> = {
  parse: (s: string[]) => Either<ParserError, T>;
};

const PaserErrorSemigroup: Semigroup<ParserError> = {
  concat: (a, b) => ({
    errors: a.errors.concat(b.errors),
  }),
};

export class PathParamParsers {
  string: PathParamParser<string> = {
    parse: (s) => right(s[0]),
  };
  int: PathParamParser<number> = {
    parse: (s) => {
      const result = parseInt(s[0]);
      return isNaN(result)
        ? left({ errors: [`Invalid int in path param: ${s}`] })
        : right(result);
    },
  };
  float: PathParamParser<number> = {
    parse: (s) => {
      const result = parseFloat(s[0]);
      return isNaN(result)
        ? left({ errors: [`Invalid float in path param: ${s}`] })
        : right(result);
    },
  };
  "string[]": PathParamParser<string[]> = {
    parse: (s) => {
      return right(s);
    },
  };
  "int[]": PathParamParser<number[]> = {
    parse: (s) => {
      const A = getApplicativeValidation(PaserErrorSemigroup);
      return L.traverse(A)(this.float.parse)(s.map((i) => [i]));
    },
  };

  "float[]": PathParamParser<number[]> = {
    parse: (s) => {
      const A = getApplicativeValidation(PaserErrorSemigroup);
      return L.traverse(A)(this.float.parse)(s.map((i) => [i]));
    },
  };
}

export const PathParamRegex = /\{([^\}/]+)\}/;
export const parsePathParams = (
  incomingUrl: string,
  pathSpec: string
): Either<string[], Record<string, unknown>> => {
  type Parsers = keyof PathParamParsers;
  const parsers = new PathParamParsers() as Record<
    Parsers,
    PathParamParser<unknown>
  >;
  const incomingPathSegments = incomingUrl.split("/");
  const pathSpecSegments = pathSpec.split("/");
  if (incomingPathSegments.length != pathSpecSegments.length) {
    return left(["Invalid incoming url"]);
  }
  return pathSpecSegments.reduce((prev, n, ix) => {
    return FP.function.pipe(
      prev,
      E.chain((p) => {
        const params = PathParamRegex.exec(n);
        if (params) {
          const param = params[1];
          const key = param.split(":")[0];
          const parserName = param.split(":")[1];
          const parser: PathParamParser<unknown> | undefined =
            parsers[parserName as unknown as Parsers];
          const originalParam = incomingPathSegments[ix];
          const value = parser
            ? parser.parse([originalParam])
            : right(originalParam);

          return FP.function.pipe(
            value,
            E.mapLeft((e) => e.errors),
            E.map((val) => ({
              ...p,
              [key]: val,
            }))
          );
        } else {
          return right<string[], {}>(p);
        }
      })
    );
  }, right<string[], {}>({}));
};

const QueryParamRegex = /\{([^\}\?/]+)/g;
export const parseQueryParams = (
  pathParams: APIGatewayProxyEventQueryStringParameters,
  multiPathParams: APIGatewayProxyEventMultiValueQueryStringParameters,
  querySpec: string
): FP.either.Either<string[], Record<string, unknown>> => {
  type Parsers = keyof PathParamParsers;
  const parsers = new PathParamParsers() as Record<
    Parsers,
    PathParamParser<unknown>
  >;

  return [...matchAll(querySpec, QueryParamRegex)].reduce((p, n) => {
    return FP.function.pipe(
      p,
      FP.either.chain((p) => {
        const param = n[1];
        if (param) {
          const keySpec = param.split(":")[0];
          const key = keySpec.split("?")[0];
          const isNullable = keySpec.endsWith("?");
          const originalParam = pathParams[key] || multiPathParams[key];
          if (!isNullable && !originalParam) {
            return FP.either.left([`Query param not found: ${key}`]);
          } else {
            const parserName = param.split(":")[1];
            const parser: PathParamParser<unknown> | undefined =
              parsers[parserName as unknown as Parsers];
            const value =
              parser && originalParam
                ? parser.parse(
                    Array.isArray(originalParam)
                      ? originalParam
                      : [originalParam]
                  )
                : right(originalParam);

            return FP.function.pipe(
              value,
              E.mapLeft((e) => e.errors),
              E.map((val) => ({
                ...p,
                [key]: val,
              }))
            );
          }
        } else {
          return FP.either.right(p);
        }
      })
    );
  }, right<string[], {}>({}));
};

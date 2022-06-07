import { RouteHandlerDefinition, StatusCode } from "./router";
import { Type } from "@sinclair/typebox";
import matchAll from "string.prototype.matchall";
import { merge } from "lodash";

type OpenApiParam = {
  in: "path" | "query";
  name: string;
  required: boolean;
  schema: {
    type: "integer" | "string" | "boolean";
  };
};

const paramRegex = /{(?<name>[\w-_]+)(:(?<type>\w+))?(?<optional>\?)?}/g;

const mapToOpenApiType = (s?: string): "integer" | "string" | "boolean" => {
  switch (s) {
    case "int":
      return "integer";
    case "bool":
      return "boolean";
    default:
      return "string";
  }
};

const stripTypes = (p: string) => p.replace(/:\w+}/g, "}");

export type ApiInfo = {
  title: string;
  description?: string;
  version: string;
};

type ApiGatewayOpenIdAuthorizerConfiguration = {
  type: "jwt";
  jwtConfiguration: {
    audience: string[];
  };
  identitySource: string;
};
type ApiGatewayOAuthAuthorizerConfiguration = {
  type: "jwt";
  jwtConfiguration: {
    issuer: string;
    audience: string[];
  };
};
type CustomLambdaAuthorizerConfiguration = {
  type: "request";
  identitySource: "$request.header.Authorization" | string;
  authorizerUri: string;
  authorizerPayloadFormatVersion: "2.0";
  authorizerResultTtlInSeconds: number;
  enableSimpleResponses: boolean;
};

type OpenIdSecurityScheme = {
  type: "openIdConnect";
  openIdConnectUrl: string;
  "x-amazon-apigateway-authorizer": ApiGatewayOpenIdAuthorizerConfiguration;
};

type OAuthSecurityScheme = {
  type: "oauth2";
  "x-amazon-apigateway-authorizer": ApiGatewayOAuthAuthorizerConfiguration;
};

type CustomLambdaSecurityScheme = {
  type: "apiKey";
  in: "header" | "query"
  name: "Authorization"
  "x-amazon-apigateway-authorizer": CustomLambdaAuthorizerConfiguration;
};

export type SecurityScheme =
  | OpenIdSecurityScheme
  | OAuthSecurityScheme
  | CustomLambdaSecurityScheme;

const toOpenApiObject = (
  route: RouteDefinition,
  payloadFormatVersion: "1.0" | "2.0",
  apiInfo: ApiInfo,
  functionArn: string,
  apiRoleArn?: string,
  securitySchemes?: {
    [k: string]: SecurityScheme;
  }
) => {
  const model = route.body ? Type.Strict(route.body) : null;
  const responses = Object.keys(route.responses).reduce(
    (p, k) => ({
      [parseInt(k)]: {
        description:
          (route.responses[parseInt(k) as StatusCode]?.$static as any)
            ?.description || "",
        content: {
          "application/json": {
            schema: Type.Strict(route.responses[parseInt(k) as StatusCode]!),
          },
        },
      },
      ...p,
    }),
    {}
  );
  const [path, ...querys] = route.url.split("?");
  const query = querys.join("");
  const params = [...matchAll(path, paramRegex)].map<OpenApiParam>((p) => ({
    in: "path",
    name: p.groups!["name"]!,
    required: true,
    schema: {
      type: mapToOpenApiType(p.groups!["type"]),
    },
  }));
  const queryParams = query
    ? [...matchAll(query, paramRegex)].map<OpenApiParam>((p) => ({
        in: "query",
        name: p.groups!["name"]!,
        required: !!p.groups!["optional"],
        schema: {
          type: mapToOpenApiType(p.groups!["type"]),
        },
      }))
    : null;
  const allParams = params.concat(queryParams || []);
  const paths = {
    [stripTypes(path)]: {
      [route.method.toLowerCase()]: {
        parameters: allParams,
        responses: responses,
        ...(model
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: model,
                  },
                },
              },
            }
          : {}),
        "x-amazon-apigateway-integration": {
          type: "AWS_PROXY",
          httpMethod: "POST",
          uri: functionArn,
          payloadFormatVersion,
          ...(apiRoleArn ? { credentials: apiRoleArn } : {}),
        },
        ...(route.useIamAuth
          ? { "x-amazon-apigateway-auth": { type: "AWS_IAM" } }
          : {}),
        ...(route.security
          ? { security: [{ [route.security.scheme]: route.security.scopes }] }
          : {}),
      },
    },
  };
  return {
    openapi: "3.0.1",
    info: apiInfo,
    paths,
    ...(securitySchemes
      ? {
          components: { securitySchemes },
        }
      : {}),
  };
};

export type RouteDefinition = Omit<RouteHandlerDefinition<"V1">, "handler">;

export const toOpenApi = (
  routes: readonly RouteDefinition[],
  payloadFormatVersion: "1.0" | "2.0",
  apiInfo: ApiInfo,
  functionArn: string,
  apiRoleArn?: string,
  securitySchemes?: {
    [k: string]: SecurityScheme;
  }
): object =>
  routes.reduce(
    (p, n) =>
      merge(
        p,
        toOpenApiObject(
          n,
          payloadFormatVersion,
          apiInfo,
          functionArn,
          apiRoleArn,
          securitySchemes
        )
      ),
    {}
  );

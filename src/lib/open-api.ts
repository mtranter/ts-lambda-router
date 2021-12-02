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

const toOpenApiObject = (
  route: RouteDefinition,
  payloadFormatVersion: "1.0" | "2.0",
  apiInfo: ApiInfo,
  functionArn: string
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
          httpMethod: route.method.toUpperCase(),
          uri: functionArn,
          payloadFormatVersion,
        },
        ...(route.useIamAuth ? { "x-amazon-apigateway-auth": "AWS_IAM" } : {}),
      },
    },
  };
  return {
    openapi: "3.0.1",
    info: apiInfo,
    paths,
  };
};

export type RouteDefinition = Omit<RouteHandlerDefinition<"V1">, "handler">;

export const toOpenApi = (
  routes: readonly RouteDefinition[],
  payloadFormatVersion: "1.0" | "2.0",
  apiInfo: ApiInfo,
  functionArn: string
): object =>
  routes.reduce(
    (p, n) =>
      merge(p, toOpenApiObject(n, payloadFormatVersion, apiInfo, functionArn)),
    {}
  );

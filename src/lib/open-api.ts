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

const toOpenApiObject = (route: RouteDefinition) => {
  const model = route.body ? Type.Strict(route.body) : null;
  const responses = Object.keys(route.responses).map(k => ({[k]: Type.Strict(route.responses[parseInt(k) as StatusCode]!)}))
  const path = route.url.split("?")[0];
  const query = route.url.indexOf("?") > -1 ? route.url.split("?")[1] : null;
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
        in: "path",
        name: p.groups!["name"]!,
        required: !!p.groups!["optional"],
        schema: {
          type: mapToOpenApiType(p.groups!["type"]),
        },
      }))
    : null;
  const allParams = params.concat(queryParams || []);
  return {
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
      },
    },
  };
};

export type RouteDefinition = Omit<RouteHandlerDefinition, "handler">;

export const toOpenApiPart = (routes: readonly RouteDefinition[]): object =>
  routes.reduce((p, n) => merge(p, toOpenApiObject(n)), {});

import { toOpenApi } from "./open-api";
import jsYaml from "js-yaml";
import { Type } from "@sinclair/typebox";

describe("toOpenApiPart", () => {
  it("should return a valid open api", () => {
    const api = toOpenApi(
      [
        {
          url: "/people/{name:string}",
          method: "delete",
          useIamAuth: true,
          responses: {
            200: Type.String(),
          },
        },
        {
          url: "/people/{name:string}",
          method: "get",
          useIamAuth: true,
          responses: {
            200: Type.String(),
          },
        },
        {
          url: "/people/{name:string}/aged/{age:int}?{menOnly:bool?}",
          method: "post",
          useIamAuth: true,
          responses: {
            200: Type.String(),
          },
          body: Type.Object(
            {
              name: Type.String({description: "The Name"}),
            },
            { additionalProperties: false }
          ),
        },
      ],
      "1.0",
      { title: "Test Api", version: "1.0.0" },
      "<arn placeholder>"
    );
    expect(api).toBeTruthy();
    console.log(JSON.stringify(api))
  });
});

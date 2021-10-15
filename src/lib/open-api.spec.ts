import { toOpenApiPart } from "./open-api";
import jsYaml from "js-yaml";
import { Type } from "@sinclair/typebox";

describe("toOpenApiPart", () => {
  it("should return a valid open api", () => {
    const api = toOpenApiPart([
      {
        url: "/people/{name:string}/aged/{age:int}?{menOnly:bool?}",
        method: "post",
        responses: {
          200: Type.String(),
        },
        body: Type.Object(
          {
            name: Type.String(),
          },
          { additionalProperties: false }
        ),
      },
    ]);
    expect(api).toBeTruthy();
    const ymlDef = jsYaml.dump(api);
    expect(ymlDef).toEqual(`/people/{name}/aged/{age}:
  post:
    parameters:
      - in: path
        name: name
        required: true
        schema:
          type: string
      - in: path
        name: age
        required: true
        schema:
          type: integer
    responses:
      - '200':
          type: string
    requestBody:
      required: true
      content:
        application/json:
          schema:
            additionalProperties: false
            type: object
            properties:
              name:
                type: string
            required:
              - name
`);
  });
});

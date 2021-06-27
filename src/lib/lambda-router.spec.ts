import { Type } from "@sinclair/typebox";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { LambdaRouter } from "./lambda-router";

describe("ApiHandler", () => {
  const testHandler =
    (h: APIGatewayProxyHandler) =>
    (event: Partial<APIGatewayProxyEvent>): Promise<APIGatewayProxyResult> =>
      h(event as any as APIGatewayProxyEvent, null as any, null as any) as any;

  it("should handle the root route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/")((r, o) => r.response(200, "OK"))
    );
    const result = await testHandler(handler)({
      path: "/",
      httpMethod: "get",
      body: "",
    });

    expect(JSON.parse(result.body)).toEqual("OK");
    expect(result.statusCode).toEqual(200);
  });

  it("should handle a root route with escaped characters", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/{userId}")((r, o) => r.response(200, r.pathParams.userId))
    );
    const result = await testHandler(handler)({
      path: "/github%7C3257273",
      httpMethod: "get",
      body: "",
    });
    expect(JSON.parse(result.body)).toEqual("github|3257273");
    expect(result.statusCode).toEqual(200);
  });

  it("should return 404 for unknown route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/", { 200: Type.String() })((r, o) => r.response(200, "OK"))
    );
    const result = await testHandler(handler)({
      path: "/hello",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(404);
  });

  it("should correct params for parameterised route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/name/{name}/age/{age:int}")((r, o) =>
        r.response(200, r.pathParams)
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(200);

    expect(JSON.parse(result.body)).toEqual({ name: "john", age: 30 });
  });

  it("should correct params for float parameterised route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/name/{name}/age/{age:float}")((r, o) =>
        r.response(200, r.pathParams)
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(200);

    expect(JSON.parse(result.body)).toEqual({ name: "john", age: 30 });
  });
  it("should correct params for parameterised post route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.post(
        "/name/{name}/age/{age:int}",
        Type.Object({
          creditCardNumber: Type.String(),
        })
      )((r, o) => r.response(200, { ...r.pathParams, ...r.body }))
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "post",
      body: '{"creditCardNumber": "1234 5678 8765 4321"}',
    });
    expect(result.statusCode).toEqual(200);

    expect(JSON.parse(result.body)).toEqual({
      name: "john",
      age: 30,
      creditCardNumber: "1234 5678 8765 4321",
    });
  });
  it("should correct 400 for parameterised post route with invalid body", async () => {
    const handler = LambdaRouter.build((r) =>
      r
        .get("/name/{name}/age/{age:int}")((r, o) =>
          r.response(200, r.pathParams)
        )
        .post(
          "/name/{name}/age/{age:int}",
          Type.Object({
            creditCardNumber: Type.String(),
          })
        )((r, o) => r.response(200, { ...r.pathParams, ...r.body }))
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "post",
      body: '{"creditCard": "1234 5678 8765 4321"}',
    });
    expect(result.statusCode).toEqual(400);
    const yml = handler.toOpenApiPart();
    expect(yml).toEqual(`/name/{name}/age/{age}:
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
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '201':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '400':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '404':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '500':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            additionalProperties: false
            properties:
              creditCardNumber:
                type: string
            required:
              - creditCardNumber
  get:
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
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '201':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '400':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '404':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
      - '500':
          anyOf:
            - type: object
              additionalProperties: true
            - type: string
`);
  });
  it("should return 400 for poorly formatted url", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/name/{name}/age/{age:int}")((r, o) =>
        r.response(200, r.pathParams)
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/afd",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(404);
  });
  it("should correct params for parameterised route with query strings", async () => {
    const handler = LambdaRouter.build((routes) =>
      routes.get("/name/{name}/age/{age:int}?{gender}")((r, o) =>
        r.response(200, { ...r.pathParams, ...r.queryParams })
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "get",
      queryStringParameters: {
        gender: "male",
      },
      body: "",
    });
    expect(result.statusCode).toEqual(200);

    expect(JSON.parse(result.body)).toEqual({
      name: "john",
      age: 30,
      gender: "male",
    });
  });

  describe("CORS Headers", () => {
    it("should add permissive cors headers when passed 'true' for cors config", async () => {
      const handler = LambdaRouter.build(
        (routes) =>
          routes.get("/")((r, o) =>
            r.response(200, "OK")
          ),
        { corsConfig: true }
      );
      const result = await testHandler(handler)({
        path: "/",
        httpMethod: "get",
        body: "",
      });
      expect(result.headers).toEqual({
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Origin": "*",
      });
    });
    it("should add configured cors headers", async () => {
      const handler = LambdaRouter.build(
        (routes) =>
          routes.get("/")((r, o) =>
            r.response(200, "OK")
          ),
        {
          corsConfig: {
            allowCredentials: false,
            allowHeaders: ["content-type", "user-agent"],
            allowOrigin: ["http://localhost:8080"],
            allowMethods: ["PUT", "POST", "GET"],
          },
        }
      );
      const result = await testHandler(handler)({
        path: "/",
        httpMethod: "get",
        body: "",
        headers: {
          origin: "http://localhost:8080",
        },
      });
      expect(result.headers).toEqual({
        "Access-Control-Allow-Credentials": "false",
        "Access-Control-Allow-Headers": "content-type, user-agent",
        "Access-Control-Allow-Methods": "PUT, POST, GET",
        "Access-Control-Allow-Origin": "http://localhost:8080",
      });
    });
  });
});

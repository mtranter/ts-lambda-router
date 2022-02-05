import { Type } from "@sinclair/typebox";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { LambdaRouter } from "./lambda-router";
import { HttpHandler } from "./router";

describe("ApiHandler", () => {
  const testHandler =
    (h: APIGatewayProxyHandler) =>
    (event: Partial<APIGatewayProxyEvent>): Promise<APIGatewayProxyResult> =>
      h(event as any as APIGatewayProxyEvent, null as any, null as any) as any;

  it("should handle the root route", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/")(({ req }) => req.response(200, "OK"))
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
      r.get("/{userId}")(({ req }) => req.response(200, req.pathParams.userId))
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
      r.get("/", { responsesSchema: { 200: Type.String() } })(({ req }) =>
        req.response(200, "OK")
      )
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
      r.get("/name/{name}/age/{age:int}")(({ req }) =>
        req.response(200, req.pathParams)
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
      r.get("/name/{name}/age/{age:float}")(({ req }) =>
        req.response(200, req.pathParams)
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
      )(({ req }) => req.response(200, { ...req.pathParams, ...req.body }))
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
        .get("/name/{name}/age/{age:int}")(({ req }) =>
          req.response(200, req.pathParams)
        )
        .post(
          "/name/{name}/age/{age:int}",
          Type.Object({
            creditCardNumber: Type.String(),
          })
        )(({ req }) => req.response(200, { ...req.pathParams, ...req.body }))
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "post",
      body: '{"creditCard": "1234 5678 8765 4321"}',
    });
    expect(result.statusCode).toEqual(400);
  });
  it("should return 400 for poorly formatted url", async () => {
    const handler = LambdaRouter.build((r) =>
      r.get("/name/{name}/age/{age:int}")(({ req }) =>
        req.response(200, req.pathParams)
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/afd",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(400);
  });
  it("should correct params for parameterised route with query strings", async () => {
    const handler = LambdaRouter.build((routes) =>
      routes.get("/name/{name}/age/{age:int}?{gender}")(({ req }) =>
        req.response(200, { ...req.pathParams, ...req.queryParams })
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

  it("should return 200 for for route with typed query strings and valid values", async () => {
    const handler = LambdaRouter.build((routes) =>
      routes.get("/people?{ids:int[]}")(({ req }) =>
        req.response(200, { ...req.pathParams, ...req.queryParams })
      )
    );
    const result = await testHandler(handler)({
      path: "/people",
      httpMethod: "get",
      multiValueQueryStringParameters: {
        ids: "123,321,111,222,333".split(","),
      },
      body: "",
    });
    expect(result.statusCode).toEqual(200);

    expect(JSON.parse(result.body)).toEqual({
      ids: "123,321,111,222,333".split(",").map((i) => parseInt(i)),
    });
  });
  it("should return 400 for for route with typed query strings and invalid values", async () => {
    const handler = LambdaRouter.build((routes) =>
      routes.get("/people?{ids:int[]}")(
        HttpHandler.of((req) =>
          req.response(200, { ...req.pathParams, ...req.queryParams })
        )
      )
    );
    const result = await testHandler(handler)({
      path: "/people",
      httpMethod: "get",
      multiValueQueryStringParameters: {
        ids: "aaa,321,ccc,222,333".split(","),
      },
      body: "",
    });
    expect(result.statusCode).toEqual(400);
  });

  describe("CORS Headers", () => {
    it("should add permissive cors headers when passed 'true' for cors config", async () => {
      const handler = LambdaRouter.build(
        (routes) => routes.get("/")(({ req }) => req.response(200, "OK")),
        { corsConfig: true }
      );
      const result = await testHandler(handler)({
        path: "/",
        httpMethod: "get",
        body: "",
      });
      expect(result.headers).toMatchObject({
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Origin": "*",
      });
    });
    it("should add configured cors headers", async () => {
      const handler = LambdaRouter.build(
        (routes) => routes.get("/")(({ req }) => req.response(200, "OK")),
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
      expect(result.headers).toMatchObject({
        "Access-Control-Allow-Credentials": "false",
        "Access-Control-Allow-Headers": "content-type, user-agent",
        "Access-Control-Allow-Methods": "PUT, POST, GET",
        "Access-Control-Allow-Origin": "http://localhost:8080",
      });
    });
  });
});

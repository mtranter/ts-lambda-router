import { Type } from "@sinclair/typebox";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { ApiBuilder } from "./api-builder";

describe("ApiHandler", () => {
  const testHandler =
    (h: APIGatewayProxyHandler) =>
    (event: Partial<APIGatewayProxyEvent>): Promise<APIGatewayProxyResult> =>
      h(event as any as APIGatewayProxyEvent, null as any, null as any) as any;

  it("should handle the root route", async () => {
    const handler = ApiBuilder.build((r) =>
      r.get("/")((r, o) => Promise.resolve({ statusCode: 200, body: "OK" }))
    );
    const result = await testHandler(handler)({
      path: "/",
      httpMethod: "get",
      body: "",
    });
    expect(result.body).toEqual("OK");
    expect(result.statusCode).toEqual(200);
  });

  it("should return 404 for unknown route", async () => {
    const handler = ApiBuilder.build((r) =>
      r.get("/")((r, o) => Promise.resolve({ statusCode: 200, body: "OK" }))
    );
    const result = await testHandler(handler)({
      path: "/hello",
      httpMethod: "get",
      body: "",
    });
    expect(result.statusCode).toEqual(404);
  });

  it("should correct params for parameterised route", async () => {
    const handler = ApiBuilder.build((r) =>
      r.get("/name/{name}/age/{age:int}")((r, o) =>
        Promise.resolve({ statusCode: 200, body: JSON.stringify(r.pathParams) })
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
    const handler = ApiBuilder.build((r) =>
      r.get("/name/{name}/age/{age:float}")((r, o) =>
        Promise.resolve({ statusCode: 200, body: JSON.stringify(r.pathParams) })
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
    const handler = ApiBuilder.build((r) =>
      r
        .get("/name/{name}/age/{age:int}")((r, o) =>
          Promise.resolve({
            statusCode: 200,
            body: JSON.stringify(r.pathParams),
          })
        )
        .post(
          "/name/{name}/age/{age:int}",
          Type.Object({
            creditCardNumber: Type.String(),
          })
        )((r, o) =>
        Promise.resolve({
          statusCode: 200,
          body: JSON.stringify({ ...r.pathParams, ...r.body }),
        })
      )
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
    const handler = ApiBuilder.build((r) =>
      r
        .get("/name/{name}/age/{age:int}")((r, o) =>
          Promise.resolve({
            statusCode: 200,
            body: JSON.stringify(r.pathParams),
          })
        )
        .post(
          "/name/{name}/age/{age:int}",
          Type.Object({
            creditCardNumber: Type.String(),
          })
        )((r, o) =>
        Promise.resolve({
          statusCode: 200,
          body: JSON.stringify({ ...r.pathParams, ...r.body }),
        })
      )
    );
    const result = await testHandler(handler)({
      path: "/name/john/age/30",
      httpMethod: "post",
      body: '{"creditCard": "1234 5678 8765 4321"}',
    });
    expect(result.statusCode).toEqual(400);
  });
  it("should return 400 for poorly formatted url", async () => {
    const handler = ApiBuilder.build((r) =>
      r.get("/name/{name}/age/{age:int}")((r, o) =>
        Promise.resolve({ statusCode: 200, body: JSON.stringify(r.pathParams) })
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
    const handler = ApiBuilder.build((r) =>
      r.get("/name/{name}/age/{age:int}?{gender}")((r, o) =>
        Promise.resolve({
          statusCode: 200,
          body: JSON.stringify({ ...r.pathParams, ...r.queryParams }),
        })
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
});

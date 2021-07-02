import { APIGatewayProxyEvent } from "aws-lambda";
import { logRequestResponse } from "./logging";

describe("logRequestResponse", () => {
  const info = jest.fn().mockReturnValue({});
  const logger = {
    info,
  };
  it("should log request", () => {
    const request = {
      path: "/home",
      headers: {
        "content-type": "application/json",
      },
      httpMethod: "get",
      body: JSON.stringify({ name: "Hello World" }),
    } as unknown as APIGatewayProxyEvent;
    logRequestResponse(request, {
      logConfig: {
        logger,
        logRequests: true,
        logRequestBody: true,
      },
    });
    const args = info.mock.calls[0][1];
    expect(args).toMatchObject(request);
  });

  it("should log request with obfuscated body", () => {
    const request = {
      path: "/home",
      headers: {
        "content-type": "application/json",
      },
      httpMethod: "get",
      body: JSON.stringify({ name: "Hello World" }),
    } as unknown as APIGatewayProxyEvent;
    logRequestResponse(request, {
      logConfig: {
        logger,
        logRequests: true,
      },
    });
    const args = info.mock.calls[0][1];
    const {body, ...sansBody} = request
    expect(args).toMatchObject(sansBody);
  });
  it("should log request with removed headers", () => {
    const request = {
      path: "/home",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer super-secret"
      },
      httpMethod: "get",
      body: JSON.stringify({ name: "Hello World" }),
    } as unknown as APIGatewayProxyEvent;
    logRequestResponse(request, {
      logConfig: {
        logger,
        logRequests: true,
        logRequestBody: true,
        ignoredHeaders: ['Authorization']
      },
    });
    const args = info.mock.calls[0][1];
    const { headers: {authorization}, ...rest} = request
    expect(args).toMatchObject(rest);
  });
});

import { APIGatewayProxyResult } from "aws-lambda";
import { LambdaRouter } from "..";
import { Middleware } from "./middleware";

describe("Middleware", () => {
  type UserContext = { userId: string };
  const authMiddleware = Middleware.of<UserContext>(
    (req, original, handler) => {
      const userId = original.originalEvent.headers["x-user-id"];
      if (!userId) {
        return Promise.resolve({
          statusCode: 401,
          body: "Unauthorized",
        });
      } else {
        return handler(req, original, { userId });
      }
    }
  );

  const routes = LambdaRouter.build((r) =>
    r.get("/route")(
      authMiddleware(async (req, orig, user) => ({
        statusCode: 200,
        body: user,
      }))
    )
  );

  const act = (
    headers: Record<string, string>
  ): Promise<APIGatewayProxyResult> =>
    routes(
      {
        path: "/route",
        httpMethod: "GET",
        headers,
      } as any,
      null as any,
      null as any
    ) as any;
  it("should inject variables into wrapped route", async () => {
    const response = await act({
      "x-user-id": "123",
    });
    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body)).toEqual({ userId: "123" });
  });
  it("should intercept route where required", async () => {
    const response = await act({});
    expect(response.statusCode).toEqual(401);
  });
});

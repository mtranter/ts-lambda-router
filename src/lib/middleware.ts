import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  Context,
} from "aws-lambda";
import { Request } from ".";
import { LambdaRouter } from "..";
import { Response, Responses, StatusCode } from "./router";

type Handler<Url extends string, B, R extends Responses, T> = (
  req: Request<Url, B, R>,
  originalEvent: {
    originalEvent: APIGatewayProxyEvent | APIGatewayProxyEventV2;
    context: Context;
  },
  t: T
) => Promise<Response<R, StatusCode>>;

type HttpHandler<Url extends string, B, R extends Responses> = Handler<
  Url,
  B,
  R,
  void
>;

export const Middleware = {
  of:
    <T>(impl: Handler<string, any, Responses, Handler<string, any, any, T>>) =>
    <Url extends string, B, R extends Responses>(
      handler: Handler<Url, B, R, T>
    ): HttpHandler<Url, B, R> =>
      ((req, orig) => {
        return impl(req as any, orig, handler as any);
      }) as HttpHandler<Url, B, R>,
};

const extractContext = (req: APIGatewayProxyEvent | APIGatewayProxyEventV2) => {
  const userId = req.headers["x-forwarded-user-id"];
  const tenantId = req.headers["x-forwarded-tenant-id"];
  return { userId, tenantId };
};

type UserContext = {tenantId: string, userId: string}
const authMiddleware = Middleware.of<UserContext>((req, original, handler) => {
  const { userId, tenantId } = extractContext(original.originalEvent);
  if (!userId || !tenantId) {
    return Promise.resolve({
      statusCode: 401 as StatusCode,
      body: "Unauthorized" as any,
    });
  } else {
    return handler(req, original, { tenantId, userId });
  }
});

const authedRoute = LambdaRouter.build((r) =>
  r.get("/routes/{id}")(
    authMiddleware(async (req, original, t) => {
      return req.response(200, "Hey");
    })
  )
);

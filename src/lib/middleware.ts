import { Static, TSchema } from "@sinclair/typebox";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  Context,
} from "aws-lambda";
import { Request } from ".";
import { LambdaRouter } from "..";
import { HttpHandler, Response, Responses, StatusCode } from "./router";

export type Middleware<I, O> = {
  run: (i: I) => Promise<O>;
  compose: <I2>(k: Middleware<I2, I>) => Middleware<I2, O>;
  andThen: <O2>(k: Middleware<O, O2>) => Middleware<I, O2>;
  map: <O2>(f: (o: O) => O2) => Middleware<I, O2>;
  contraMap: <I2>(f: (o: I2) => I) => Middleware<I2, O>;
  flatMap: <O2>(f: (o: O) => Middleware<I, O2>) => Middleware<I, O2>;
  flatMapP: <O2>(f: (o: O) => Promise<O2>) => Middleware<I, O2>;
};

export type HandlerFunction<H> = H extends Middleware<infer I, infer O>
  ? (i: I) => Promise<O>
  : never;

const KleisliInstance = <I, O>(
  run: (i: I) => Promise<O>
): Middleware<I, O> => ({
  run,
  compose: <I2>(k: Middleware<I2, I>) =>
    KleisliInstance<I2, O>((ii) => k.run(ii).then((o) => run(o))),
  andThen: <O2>(k: Middleware<O, O2>) =>
    KleisliInstance<I, O2>((i) => run(i).then(k.run)),
  map: <O2>(f: (o: O) => O2): Middleware<I, O2> =>
    KleisliInstance<I, O2>((i) => run(i).then(f)),
  contraMap: <I2>(f: (o: I2) => I): Middleware<I2, O> =>
    KleisliInstance<I2, O>((i) => run(f(i))),
  flatMapP: <O2>(f: (o: O) => Promise<O2>): Middleware<I, O2> =>
    KleisliInstance<I, O2>((i) => run(i).then(f)),
  flatMap: <O2>(f: (o: O) => Middleware<I, O2>): Middleware<I, O2> =>
    KleisliInstance<I, O2>((i) => run(i).then((o) => f(o).run(i))),
});

export const Middleware = {
  httpHandler: <
    A extends string,
    B extends TSchema,
    R extends Responses,
    S extends StatusCode
  >(
    handler: (
      req: Request<A, Static<B>, R>,
      originalContext: {
        originalEvent: APIGatewayProxyEvent;
        context: Context;
      }
    ) => Promise<Response<R, S>>
  ): HttpHandler<A, B, R, S> =>
    Middleware.of((i) => handler(i.req, i.originalEvent)),
  of: <I, O>(f: (i: I) => Promise<O>): Middleware<I, O> => KleisliInstance(f),
  pure: <I, O>(o: O): Middleware<I, O> =>
    KleisliInstance((i) => Promise.resolve(o)),
  liftP: <I, O>(o: Promise<O>): Middleware<I, O> => KleisliInstance((i) => o),
  ask: <A>(): Middleware<A, A> => KleisliInstance((a) => Promise.resolve(a)),
  fromFunction: <I, O>(f: (i: I) => O): Middleware<I, O> =>
    KleisliInstance((i) => Promise.resolve(f(i))),
};

const extractContext = (req: APIGatewayProxyEvent | APIGatewayProxyEventV2) => {
  const userId = req.headers["x-forwarded-user-id"];
  const tenantId = req.headers["x-forwarded-tenant-id"];
  return { userId, tenantId };
};

type UserContext = { tenantId: string; userId: string };
const authMiddleware = <
  A extends string,
  B extends TSchema,
  R extends Responses,
  S extends StatusCode
>(
  wrapped: HttpHandler<A, B, R, S, { userId: string; tenantId: string }>
) =>
  Middleware.httpHandler<A, B, R, S>((req, originalEvent) => {
    const { userId, tenantId } = extractContext(originalEvent.originalEvent);
    if (!userId || !tenantId) {
      return Promise.resolve({
        statusCode: 401 as StatusCode,
        body: "Unauthorized" as any,
      });
    } else {
      return wrapped.run({ req, originalEvent, tenantId, userId });
    }
  });

const authedRoute = LambdaRouter.build((r) =>
  r.get("/routes/{id}")(
    authMiddleware(async (req, original, t) => {
      return req.response(200, "Hey");
    })
  )
);

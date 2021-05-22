import { Logger } from "./types";
import { APIGatewayProxyHandler } from "aws-lambda";
import { APIEventHandler } from "./handler";
import { Router } from "./router";

export const LambdaRouter = {
  build: (
    routes: <R>(router: Router<R>) => Router<R>,
    logger?: Logger | undefined
  ): APIGatewayProxyHandler => {
    const routeDef = routes(Router());
    return APIEventHandler(routeDef, logger);
  },
};

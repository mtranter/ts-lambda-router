import { RouterConfig } from "./types";
import { APIEventHandler, ApiGatewayHandlerWithOpenApi } from "./handler";
import { Router } from "./router";

export const LambdaRouter = {
  build: (
    routes: <R>(router: Router<R>) => Router<R>,
    config?: RouterConfig
  ): ApiGatewayHandlerWithOpenApi => {
    const routeDef = routes(Router());
    return APIEventHandler(routeDef, config);
  },
};

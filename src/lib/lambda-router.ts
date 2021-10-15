import { RouterConfig } from "./types";
import { APIEventHandler, VersionedHandlerType } from "./handler-v1";
import { Router } from "./router";
import { APIEventHandlerV2 } from "./handler-v2";

export const LambdaRouter = {
  build: (
    routes: <R>(router: Router<R>) => Router<R>,
    config?: RouterConfig
  ): VersionedHandlerType<"V1"> => {
    const routeDef = routes(Router());
    return APIEventHandler(routeDef, config);
  },
};

export const LambdaRouterV2 = {
  build: (
    routes: <R>(router: Router<R>) => Router<R>,
    config?: RouterConfig
  ): VersionedHandlerType<"V2"> => {
    const routeDef = routes(Router());
    return APIEventHandlerV2(routeDef, config);
  },
};

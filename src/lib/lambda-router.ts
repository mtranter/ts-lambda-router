import { RouterConfig } from "./types";
import { APIEventHandler, VersionedHandlerType } from "./handler-v1";
import { Router } from "./router";

export const LambdaRouter = {
  build: (
    routes: <R>(router: Router<R>) => Router<R>,
    config?: RouterConfig
  ): VersionedHandlerType<"V1"> => {
    const routeDef = routes(Router());
    return APIEventHandler(routeDef, config);
  },
};

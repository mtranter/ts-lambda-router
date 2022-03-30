import { APIGatewayProxyHandler } from "aws-lambda";
import { LambdaRouter } from "../lib/lambda-router";
import * as Domain from "./domain";
import { Account, AccountCreateResponses } from "./models";

export const handler: APIGatewayProxyHandler = LambdaRouter.build((routes) =>
  routes
    .head("/accounts/${username}")(async (r) => {
      const accountExists = await Domain.accountExists(r.pathParams.username);
      return r.response(accountExists ? 200 : 404, "");
    })
    .get("/accounts/${username}")((r) =>
      Domain.getAccount(r.pathParams.username).then((a) =>
        r.response(a ? 200 : 404, a)
      )
    )
    .post("/accounts", Account)(
    (r) =>
      Domain.saveAccount(r.body)
        .then((id) =>
          r.response(201, {
            accountId: id,
          })
        )
        .catch((e) => {
          console.log("Error saving account", e);
          return r.response(400, {
            message: "Error",
          });
        })
  )
);

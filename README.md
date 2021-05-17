# Strongly Typed Router.

Bad name. Sick router.

## Uses Typescript template types to provider strongly typed goodness for your API Handlers

### Usage:

```typescript
import { Type } from "@sinclair/typebox";

export const Account = Type.Object({
  username: Type.String(),
  password: Type.String(),
  firstname: Type.String(),
  lastname: Type.String(),
  birthYear: Type.Integer(),
});

export const handler: APIGatewayProxyHandler =
    ApiBuilder.build((routes) =>
        routes
          .get("/accounts/${username}")((r) =>
            Domain
              .getAccount(r.pathParams.username)
              .then((a) => ({
                statusCode: a ? 200 : 404,
                body: JSON.stringify(a),
              })
            )
          )
          .post("/accounts", Account)(r =>
            Domain
              .saveAccount(r.body)
              .then(() => ({
                statusCode: 201,
                body: "",
              })
            )
        )

```

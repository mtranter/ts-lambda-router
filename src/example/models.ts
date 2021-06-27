import { Type, Static } from "@sinclair/typebox";

export const Account = Type.Object({
  username: Type.String(),
  password: Type.String(),
  firstname: Type.String(),
  lastname: Type.String(),
  birthYear: Type.Integer(),
});

export type Account = Static<typeof Account>;

export const AccountCreateSuccessResponse = {
  201: Type.Object({
    accountId: Type.String(),
  }),
};

export const AccountCreateFailedResponse = {
  400: Type.Object({
    message: Type.String(),
  }),
};

export const AccountCreateResponses = {
  ...AccountCreateFailedResponse,
  ...AccountCreateSuccessResponse,
};

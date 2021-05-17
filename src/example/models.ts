import { Type, Static } from "@sinclair/typebox";

export const Account = Type.Object({
  username: Type.String(),
  password: Type.String(),
  firstname: Type.String(),
  lastname: Type.String(),
  birthYear: Type.Integer(),
});

export type Account = Static<typeof Account>;

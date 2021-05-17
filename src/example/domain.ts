import { Account } from "./models";

const db: Record<string, Account> = {};

export const accountExists = (username: string): Promise<Boolean> =>
  Promise.resolve(!!db[username]);
export const saveAccount = (account: Account): Promise<void> =>
  Promise.resolve((db[account.username] = account)).then(() => void 0);
export const getAccount = (username: string): Promise<Account> =>
  Promise.resolve(db[username]);

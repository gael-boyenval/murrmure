import { openBunSqliteDatabase } from "./driver.js";
import { SqlitePersistence } from "../sqlite/store.js";

export function createBunSqlitePersistence(path: string = ":memory:"): SqlitePersistence {
  return SqlitePersistence.fromHandle(openBunSqliteDatabase(path));
}

export { openBunSqliteDatabase } from "./driver.js";

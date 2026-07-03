declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { create?: boolean });
    run(sql: string): void;
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      run(...params: unknown[]): unknown;
    };
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
    close(): void;
  }
}

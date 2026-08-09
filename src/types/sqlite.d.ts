declare module '@vercel/sqlite' {
  export type SqlRow = Record<string, unknown>;

  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    transaction<T>(fn: () => T): () => T;
  }

  export class Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): SqlRow | undefined;
    all(...params: unknown[]): SqlRow[];
  }
}

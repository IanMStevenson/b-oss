// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A DbLike (src/db.ts) backed by a real, in-memory SQLite database (Node's built-in `node:sqlite`
// — stable enough for this since D1 itself is SQLite under the hood) rather than a hand-rolled
// object-array fake. This is deliberate: it means src/schema.sql is the thing under test, not a
// second, parallel re-implementation of what the schema says that could silently drift from it.
// No miniflare/wrangler local-D1 emulation is needed for this — see the phase's own scope note in
// packages/b-mobile/RESUME.md ("wrangler dev/local D1 emulation if the test suite needs it, ...
// or stub/mock it instead" — this is the "stub it, soundly" branch of that choice).

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DbLike, D1PreparedStatementLike } from '../db.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');

// node:sqlite's own SQLInputValue type isn't re-exported for external use — every value db.ts
// ever binds is one of these four, so a narrow local type (rather than `unknown`/`any`) is both
// accurate and enough.
type SqliteParam = string | number | bigint | null;

class FakeStatement implements D1PreparedStatementLike {
  private params: SqliteParam[] = [];
  constructor(private readonly stmt: StatementSync) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.params = values as SqliteParam[];
    return this;
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.stmt.get(...this.params) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  run<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    this.stmt.run(...this.params);
    return Promise.resolve({ results: [] });
  }

  all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const rows = this.stmt.all(...this.params) as T[];
    return Promise.resolve({ results: rows });
  }
}

export class TestDb implements DbLike {
  private readonly raw: DatabaseSync;

  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec(schemaSql);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this.raw.prepare(query));
  }

  close(): void {
    this.raw.close();
  }
}

export function createTestDb(): TestDb {
  return new TestDb();
}

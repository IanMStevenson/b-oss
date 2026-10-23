// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The slice of D1 this package uses, so tests can back it with node:sqlite (src/__tests__/testDb.ts)
// instead of a hand-rolled fake. b-push has its own copy: packages never depend on each other.

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface DbLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
}

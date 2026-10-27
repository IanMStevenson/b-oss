// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Storing a probe outcome: one sample row, plus incident open/extend/close per component, in ONE
// D1 batch (free-tier discipline). An incident starts at the first confirmed-down sample and ends at
// the first passing sample after it; an Unknown sample neither opens nor closes one.

import type { D1PreparedStatementLike, DbLike } from './db.js';
import type { ProbeOutcome } from './probe.js';
import type { CheckId, Component, IncidentRow } from './types.js';

const COMPONENTS: Component[] = ['site', 'api'];

/** The open-incident rows, for `incidentStatements`. */
export async function loadOpenIncidents(db: DbLike): Promise<IncidentRow[]> {
  return (
    await db
      .prepare(
        'SELECT id, component, started_at, ended_at, failed_checks FROM incidents WHERE ended_at IS NULL',
      )
      .all<IncidentRow>()
  ).results;
}

/** The incident statements for one outcome: open on a confirmed-down component with none open,
 * extend the failed checks of an open one, close it on an up. `unknown` changes nothing (the
 * triggered re-check relies on that to touch only the components it turned down). */
export function incidentStatements(
  db: DbLike,
  open: IncidentRow[],
  outcome: Pick<ProbeOutcome, 'ts' | 'states'>,
): D1PreparedStatementLike[] {
  const stmts: D1PreparedStatementLike[] = [];
  for (const c of COMPONENTS) {
    const { state, failed } = outcome.states[c];
    const current = open.find((i) => i.component === c);
    if (state === 'down' && !current) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO incidents (component, started_at, ended_at, failed_checks) VALUES (?, ?, NULL, ?)',
          )
          .bind(c, outcome.ts, failed.join(',')),
      );
    } else if (state === 'down' && current) {
      const union = [...new Set([...current.failed_checks.split(','), ...failed])] as CheckId[];
      if (union.length !== current.failed_checks.split(',').length) {
        stmts.push(
          db
            .prepare('UPDATE incidents SET failed_checks = ? WHERE id = ?')
            .bind(union.join(','), current.id),
        );
      }
    } else if (state === 'up' && current) {
      stmts.push(
        db.prepare('UPDATE incidents SET ended_at = ? WHERE id = ?').bind(outcome.ts, current.id),
      );
    }
  }
  return stmts;
}

export async function recordSample(db: DbLike, outcome: ProbeOutcome): Promise<void> {
  const open = await loadOpenIncidents(db);

  const stmts = [
    db
      .prepare(
        'INSERT OR IGNORE INTO samples (slot, ts, site_state, api_state, retried, checks) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        outcome.slot,
        outcome.ts,
        outcome.states.site.state,
        outcome.states.api.state,
        outcome.retried ? 1 : 0,
        JSON.stringify(outcome.results),
      ),
    // First sample ever: remember when monitoring began (an ignored insert writes nothing).
    db
      .prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('first_ts', ?)")
      .bind(String(outcome.ts)),
  ];

  stmts.push(...incidentStatements(db, open, outcome));
  await db.batch(stmts);
}

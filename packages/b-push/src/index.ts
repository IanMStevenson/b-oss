// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Worker entry point: a tiny hand-rolled router for the registration contract (no framework —
// five routes don't need one) plus the scheduled() handler for both cron triggers (wrangler.toml).
// Never invoked by this repo's own tooling — see wrangler.toml's own header comment. The routing/
// auth/business logic this delegates to (src/routes/registrations.ts, src/poll.ts,
// src/prefsRefresh.ts) is what src/__tests__ actually exercises; this file is deliberately thin.

import type { CreateRegistrationBody, Env, PatchRegistrationBody } from './types.js';
import {
  createRegistration,
  patchRegistration,
  refreshPreferences,
  getRegistrationStatus,
  deleteRegistrationHandler,
  HttpError,
} from './routes/registrations.js';
import { runActivityPoll } from './poll.js';
import { runPrefsRefresh } from './prefsRefresh.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean); // ['v1', 'registrations', ...]

  if (parts[0] !== 'v1' || parts[1] !== 'registrations') {
    return json({ error: 'Not found' }, 404);
  }

  try {
    // POST /v1/registrations
    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.json<Partial<CreateRegistrationBody>>();
      const result = await createRegistration(
        db(env),
        env,
        request.headers.get('Authorization'),
        body,
      );
      return json(result, 201);
    }

    const id = parts[2];
    if (!id) return json({ error: 'Not found' }, 404);

    // PATCH /v1/registrations/:id
    if (parts.length === 3 && request.method === 'PATCH') {
      const body = await request.json<PatchRegistrationBody>();
      await patchRegistration(db(env), env, id, request.headers.get('Authorization'), body);
      return noContent();
    }

    // GET /v1/registrations/:id
    if (parts.length === 3 && request.method === 'GET') {
      const result = await getRegistrationStatus(db(env), id, request.headers.get('Authorization'));
      return json(result);
    }

    // DELETE /v1/registrations/:id
    if (parts.length === 3 && request.method === 'DELETE') {
      await deleteRegistrationHandler(db(env), id, request.headers.get('Authorization'));
      return noContent();
    }

    // POST /v1/registrations/:id/refresh-preferences
    if (parts.length === 4 && parts[3] === 'refresh-preferences' && request.method === 'POST') {
      await refreshPreferences(db(env), env, id, request.headers.get('Authorization'));
      return noContent();
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status);
    }
    return json({ error: 'Internal error' }, 500);
  }
}

function db(env: Env) {
  // env.DB (a real D1Database) structurally satisfies DbLike (src/db.ts) — no cast needed, just
  // returning it through a same-named helper keeps every route handler's call site uniform.
  return env.DB;
}

/** Cloudflare cron ties both triggers to the same `scheduled()` handler; `event.cron` is the only
 * way to tell them apart (wrangler.toml: every-1-minute for the activity poll, the hourly
 * "0 * * * *" pattern for the prefs refresh — notification-service.md's "Polling design" /
 * "Preference freshness"). Anything that isn't recognisably the hourly pattern is treated as the
 * activity poll, so an unexpected/misconfigured cron string fails toward the more frequent, less
 * damaging job rather than silently doing nothing. */
async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  if (event.cron === '0 * * * *') {
    await runPrefsRefresh(db(env), env);
  } else {
    await runActivityPoll(db(env), env);
  }
}

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};

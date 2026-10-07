// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Worker entry point: a tiny hand-rolled router for the registration contract (no framework —
// four routes don't need one) plus the scheduled() handler for the cron trigger (wrangler.toml).
// Never invoked by this repo's own tooling — see wrangler.toml's own header comment. The routing/
// auth/business logic this delegates to (src/routes/registrations.ts, src/poll.ts) is what src/__tests__ actually exercises; this file is deliberately thin.

import type { CreateRegistrationBody, Env, PatchRegistrationBody } from './types.js';
import {
  createRegistration,
  patchRegistration,
  getRegistrationStatus,
  deleteRegistrationHandler,
  HttpError,
} from './routes/registrations.js';
import { runActivityPoll } from './poll.js';
import { describeError } from './log.js';

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

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status);
    }
    console.error(
      `[b-push] ${request.method} ${new URL(request.url).pathname}: ${describeError(err)}`,
    );
    return json({ error: 'Internal error' }, 500);
  }
}

function db(env: Env) {
  // env.DB (a real D1Database) structurally satisfies DbLike (src/db.ts) — no cast needed, just
  // returning it through a same-named helper keeps every route handler's call site uniform.
  return env.DB;
}

/** The 1-minute activity poll, the only cron trigger (wrangler.toml; notification-service.md
 * "Polling design"). There used to be a second, hourly trigger that refreshed a cache of
 * Blipfoto's push settings; it was removed with that cache (b-oss#244), so `event.cron` no
 * longer needs inspecting. If the old hourly trigger were ever still attached, it would just run
 * one extra activity poll, which only polls registrations that are due anyway. */
async function handleScheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const summary = await runActivityPoll(db(env), env);
  console.log(`[b-push] activity poll ${JSON.stringify(summary)}`);
}

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};

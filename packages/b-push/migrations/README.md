# b-push D1 migrations

`../src/schema.sql` is always the full current schema, for a fresh database (and the one the
tests load); treat it as `0001`. The live D1 database already exists, so changes to it after
that are the numbered files here. Ian runs each one by hand in the Cloudflare dashboard's D1
console (`b-push` database → Console); nothing runs them automatically.

Each file is tied to a point in a deploy, because the Worker already running has to keep working
until the new one replaces it:

| File                             | When                                  | Why                                                                                                                      |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `0002_add_stream_toggles.sql`    | **Before** deploying the #244 Worker  | The new Worker reads `push_comments` / `push_notifications`. The old one ignores them, and its inserts get the defaults. |
| `0003_drop_push_prefs_cache.sql` | **After** the #244 Worker is deployed | The old Worker writes `cached_push_prefs` / `prefs_fetched_at` on insert. The new one doesn't touch them.                |

So for #244: run 0002, deploy, check a cron tick in Workers Logs, run 0003. Leaving 0003 for a
while is harmless; the columns are just unused.

To check where the live database is: `PRAGMA table_info(registrations);` in the console.

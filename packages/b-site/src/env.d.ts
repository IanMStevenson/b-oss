// Build-time settings read by the status page's client script (Astro exposes PUBLIC_* variables).
interface ImportMetaEnv {
  /** The status snapshot endpoint. Defaults to the workers.dev URL in src/status/main.ts. */
  readonly PUBLIC_STATUS_URL?: string;
  /** Cloudflare Turnstile site key (public). Empty = placeholder box, the share button needs no token. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

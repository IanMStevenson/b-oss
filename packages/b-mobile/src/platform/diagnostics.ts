// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Error diagnostics (b-oss#639). On the desktop shell, errors are written to its log file
// (userData/logs/app.log) and the error screen can copy the details and open the log folder. On
// Android, iOS and the web every function here does nothing visible, exactly as before: no logging,
// no extra UI (capability-gated through `hasErrorDiagnostics`).
//
// Nothing secret may leave this module: all text is redacted here and again by the shell. The
// redaction rules are a copy of packages/b-mobile-pc/src/shared/redact.ts (b-mobile must not depend
// on that package); keep the two in step, their tests share the same cases.

import { desktopBridge } from './desktop.js';

const REDACTED = '[redacted]';

const RULES: readonly [RegExp, string][] = [
  [
    /(authorization\b["']?\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s,;"'}&]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  [
    /\b((?:access|refresh|id|app|auth)[_-]?token|token|client[_-]?secret|secret|password|passwd|api[_-]?key|apikey|session(?:id)?|cookie|set-cookie)(["']?\s*[:=]\s*["']?)[^\s&"',;}]+/gi,
    `$1$2${REDACTED}`,
  ],
  [/([?&#]code=)[^\s&"']+/gi, `$1${REDACTED}`],
  [/\b[A-Za-z0-9_-]{32,}\b/g, REDACTED],
];

export function redact(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

export interface ErrorInfo {
  /** Where it was caught: 'boundary', 'window-error', 'unhandled-rejection'. */
  source: string;
  message: string;
  stack?: string;
}

/** True where the error screen should offer "Copy details" and "Open log folder" (desktop only). */
export function hasErrorDiagnostics(): boolean {
  return desktopBridge() !== undefined;
}

/** Anything thrown, as an ErrorInfo. */
export function toErrorInfo(source: string, thrown: unknown, extraStack?: string): ErrorInfo {
  const base =
    thrown instanceof Error
      ? { message: `${thrown.name}: ${thrown.message}`, stack: thrown.stack }
      : {
          message: typeof thrown === 'string' ? thrown : 'Non-error value thrown',
          stack: undefined,
        };
  const stack = [base.stack, extraStack].filter((s): s is string => !!s).join('\n');
  return { source, message: base.message, ...(stack ? { stack } : {}) };
}

/** Writes the error to the desktop log (redacted). Does nothing elsewhere; never throws. */
export function logError(info: ErrorInfo): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  try {
    void bridge.diagnostics
      .logError({
        source: info.source,
        message: redact(info.message),
        ...(info.stack === undefined ? {} : { stack: redact(info.stack) }),
      })
      .catch(() => undefined);
  } catch {
    // Logging must never break the app.
  }
}

/** The text "Copy details" puts on the clipboard: message, stack, app version, platform, time. */
export function buildErrorDetails(info: ErrorInfo, now: Date = new Date()): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const lines = [
    `b-mobile ${version}`,
    `Platform: ${typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'unknown'} (desktop shell)`,
    `Time: ${now.toISOString()}`,
    `Where: ${info.source}`,
    `Message: ${info.message}`,
    ...(info.stack ? ['', info.stack] : []),
  ];
  return redact(lines.join('\n'));
}

export async function copyErrorDetails(text: string): Promise<void> {
  await desktopBridge()?.diagnostics.copyText(text);
}

export async function openLogFolder(): Promise<void> {
  await desktopBridge()?.diagnostics.openLogFolder();
}

/** Logs uncaught errors and unhandled rejections from the page. Desktop only (a no-op elsewhere, so
 * Android and web behave as before). Returns a function that removes the handlers. */
export function installGlobalErrorLogging(): () => void {
  if (!hasErrorDiagnostics()) return () => {};
  const onError = (event: ErrorEvent): void =>
    logError(toErrorInfo('window-error', event.error ?? event.message));
  const onRejection = (event: PromiseRejectionEvent): void =>
    logError(toErrorInfo('unhandled-rejection', event.reason));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

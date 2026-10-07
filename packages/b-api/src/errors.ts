// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export class BlipfotoError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlipfotoError';
  }

  get isTokenInvalid(): boolean {
    return this.code === 51 || this.code === 50;
  }

  get isRateLimited(): boolean {
    return this.code === 11;
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The HTTP exchange behind an HttpError: enough to diagnose a failing endpoint (b-oss#245).
 * Never holds the Authorization header — it isn't a header the response carries, and the request
 * is described only by method, URL and form body. */
export interface HttpExchange {
  method: string;
  url: string;
  /** The request body as sent (form-encoded for mutations), if any. */
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  /** The start of the response body (empty for a bare 500). */
  responseBody: string;
}

/** The server answered, but not with a Blipfoto JSON envelope (an empty 500, an HTML error page).
 * Distinct from BlipfotoError, which is an error the API itself reported inside a valid envelope. */
export class HttpError extends Error {
  constructor(public readonly exchange: HttpExchange) {
    super(`Blipfoto returned HTTP ${exchange.status} with no usable response`);
    this.name = 'HttpError';
  }

  get status(): number {
    return this.exchange.status;
  }

  get isServerError(): boolean {
    return this.exchange.status >= 500;
  }

  /** A multi-line, secret-free account of the exchange, for logs and bug reports. */
  describe(): string {
    const { method, url, requestBody, status, statusText, responseHeaders, responseBody } =
      this.exchange;
    const headers = Object.entries(responseHeaders)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    return [
      `${method} ${url}`,
      requestBody !== undefined ? `request body: ${requestBody}` : 'request body: (none)',
      `response: ${status} ${statusText}`.trimEnd(),
      `response headers:\n${headers || '  (none)'}`,
      `response body (${responseBody.length} chars): ${responseBody || '(empty)'}`,
    ].join('\n');
  }
}

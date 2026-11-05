// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared by the redaction tests here and (as a copy) in b-mobile's platform/diagnostics tests.
export const REDACTION_CASES: readonly {
  name: string;
  input: string;
  mustNotContain: readonly string[];
}[] = [
  {
    name: 'Authorization header',
    input: 'request failed {"headers":{"Authorization":"Bearer tok_Abc123xyz789"}}',
    mustNotContain: ['tok_Abc123xyz789'],
  },
  {
    name: 'bare bearer in a stack',
    input: 'Error: 401 for Bearer abcDEF123456.ghi-jkl',
    mustNotContain: ['abcDEF123456'],
  },
  {
    name: 'access_token in a URL fragment',
    input: 'redirect b-mobile://oauth#access_token=SECRETVALUE9&token_type=bearer',
    mustNotContain: ['SECRETVALUE9'],
  },
  {
    name: 'token in a query string',
    input: 'GET https://api.example/4/user?token=hunter2hunter2&x=1 failed',
    mustNotContain: ['hunter2hunter2'],
  },
  {
    name: 'JSON access_token',
    input: '{"access_token":"qwertyuiop12","expires":3600}',
    mustNotContain: ['qwertyuiop12'],
  },
  {
    name: 'OAuth code in a URL',
    input: 'callback https://x.test/cb?state=1&code=abc123def456 failed',
    mustNotContain: ['abc123def456'],
  },
  {
    name: 'long opaque string',
    input: 'unexpected value 0123456789abcdef0123456789abcdef0123 in response',
    mustNotContain: ['0123456789abcdef0123456789abcdef0123'],
  },
];

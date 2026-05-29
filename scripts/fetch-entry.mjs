#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Debug CLI: fetch a single Blipfoto entry with all detail flags on and
// dump the raw API response. Used to diagnose missing/empty fields in
// saved entry JSON files.
//
// Usage:
//   npm run fetch-entry -- --token <access_token> --entry <entry_id> [--out <path>]

import { writeFileSync } from 'fs';
import { BlipfotoClient, BlipfotoError, NetworkError } from '../packages/b-api/dist/index.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token' || a === '--entry' || a === '--out' || a === '--base-url') {
      args[a.slice(2)] = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      console.error(`Unknown arg: ${a}`);
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run fetch-entry -- --token <access_token> --entry <entry_id> [--out <path>] [--base-url <url>]

Fetches one Blipfoto entry with returnDetails, returnMetadata, returnComments,
includeReplies, and returnImageUrls all set to true — matching exactly what
BackupEngine.fetchAndWriteEntry requests. Prints the raw response data to
stdout (and to --out if given) so it can be compared with the saved JSON file.
`);
}

function redactToken(s) {
  if (!s || s.length < 8) return '***';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.token || !args.entry) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const baseUrl = args['base-url'] ?? 'https://api.blipfoto.com/4/';
  const client = new BlipfotoClient(args.token, baseUrl);

  const requestUrl = new URL('entry.json', baseUrl);
  requestUrl.searchParams.set('entry_id', args.entry);
  requestUrl.searchParams.set('return_details', '1');
  requestUrl.searchParams.set('return_metadata', '1');
  requestUrl.searchParams.set('return_comments', '1');
  requestUrl.searchParams.set('include_replies', '1');
  requestUrl.searchParams.set('return_image_urls', '1');
  console.error(`Request URL: ${requestUrl.toString()}`);
  console.error(`Token: ${redactToken(args.token)}`);
  console.error('');

  let response;
  try {
    response = await client.getEntry(args.entry, {
      returnDetails: true,
      returnMetadata: true,
      returnComments: true,
      includeReplies: true,
      returnImageUrls: true,
    });
  } catch (err) {
    if (err instanceof BlipfotoError) {
      console.error(`Blipfoto API error: code=${err.code} message=${err.message}`);
    } else if (err instanceof NetworkError) {
      console.error(`Network error: ${err.message}`);
    } else {
      console.error(`Unexpected error: ${err}`);
    }
    process.exit(2);
  }

  const rate = client.rateLimitInfo;
  if (rate) {
    console.error(
      `Rate limit: remaining=${rate.remaining}/${rate.limit} resetIn=${rate.resetInSeconds}s`,
    );
    console.error('');
  }

  const out = JSON.stringify(response, null, 2);
  console.log(out);

  if (args.out) {
    writeFileSync(args.out, out, 'utf8');
    console.error(`Wrote ${args.out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

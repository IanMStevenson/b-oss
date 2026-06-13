// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Package the built b-ark-chrome extension for distribution.
//
//   node scripts/package.mjs
//
// Produces (in the package root):
//   - b-ark-chrome-<version>.zip  — upload this to the Chrome Web Store
//   - b-ark-chrome-<version>.crx  — signed CRX3 for self-hosted install (only
//                                   when key.pem is present)
//
// Also prints the pinned extension ID derived from the manifest "key" so it can
// be confirmed against the value Chrome assigns on load. Run `npm run build`
// first — this script packages the existing dist/, it does not build.

import { createSign, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');
const KEY_PEM = join(PKG_ROOT, 'key.pem');

// ── Extension ID from the manifest "key" (public DER, base64) ──────────────────
function extensionId(pubKeyDer) {
  const hash = createHash('sha256').update(pubKeyDer).digest();
  // First 16 bytes, each hex nibble mapped 0-9a-f → a-p.
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0x0f));
  }
  return id;
}

// ── Minimal store-only ZIP writer (no deps, deterministic) ─────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, base));
    else out.push({ rel: relative(base, full).split(sep).join('/'), data: readFileSync(full) });
  }
  return out;
}

function buildZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  // Fixed DOS timestamp (1980-01-01) for reproducible archives.
  const dosTime = 0;
  const dosDate = 0x21;
  for (const f of files) {
    const name = Buffer.from(f.rel, 'utf8');
    const crc = crc32(f.data);
    const size = f.data.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // method: store
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18); // compressed
    lh.writeUInt32LE(size, 22); // uncompressed
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28); // extra len
    locals.push(lh, name, f.data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0, 8); // flags
    ch.writeUInt16LE(0, 10); // method
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(size, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);

    offset += lh.length + name.length + f.data.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

// ── CRX3 writer (Cr24, version 3) ──────────────────────────────────────────────
function varint(n) {
  const bytes = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

/** length-delimited protobuf field: tag = (field<<3)|2 */
function lenField(field, payload) {
  const tag = varint((field << 3) | 2);
  return Buffer.concat([tag, varint(payload.length), payload]);
}

function buildCrx(zip, pemPath, pubKeyDer) {
  const privateKey = readFileSync(pemPath, 'utf8');
  const crxId = createHash('sha256').update(pubKeyDer).digest().subarray(0, 16);

  // SignedData { crx_id = field 1 }
  const signedHeaderData = lenField(1, crxId);

  // Signature is over: "CRX3 SignedData\x00" + uint32LE(len) + signedHeaderData + zip
  const prefix = Buffer.from('CRX3 SignedData\x00', 'latin1');
  const lenLE = Buffer.alloc(4);
  lenLE.writeUInt32LE(signedHeaderData.length, 0);
  const signedPayload = Buffer.concat([prefix, lenLE, signedHeaderData, zip]);

  const signer = createSign('sha256');
  signer.update(signedPayload);
  const signature = signer.sign(privateKey);

  // AsymmetricKeyProof { public_key = field 1, signature = field 2 }
  const proof = Buffer.concat([lenField(1, pubKeyDer), lenField(2, signature)]);
  // CrxFileHeader { sha256_with_rsa = field 2 (repeated), signed_header_data = field 10000 }
  const header = Buffer.concat([lenField(2, proof), lenField(10000, signedHeaderData)]);

  const magic = Buffer.from('Cr24', 'latin1');
  const version = Buffer.alloc(4);
  version.writeUInt32LE(3, 0);
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(header.length, 0);
  return Buffer.concat([magic, version, headerLen, header, zip]);
}

// ── Main ───────────────────────────────────────────────────────────────────────
function main() {
  const manifest = JSON.parse(readFileSync(join(PKG_ROOT, 'manifest.json'), 'utf8'));
  if (!manifest.key) {
    console.error('manifest.json has no "key" — cannot derive a stable extension ID. Aborting.');
    process.exit(1);
  }
  const pubKeyDer = Buffer.from(manifest.key, 'base64');
  const id = extensionId(pubKeyDer);
  const version = manifest.version;

  console.log(`b-ark-chrome v${version}`);
  console.log(`pinned extension ID: ${id}`);

  if (!existsSync(DIST) || !existsSync(join(DIST, 'manifest.json'))) {
    console.error(`\nNo build found at ${DIST}. Run "npm run build" first.`);
    process.exit(1);
  }

  const files = collectFiles(DIST);
  const zip = buildZip(files);
  const zipPath = join(PKG_ROOT, `b-ark-chrome-${version}.zip`);
  writeFileSync(zipPath, zip);
  console.log(`\nwrote ${relative(PKG_ROOT, zipPath)}  (${files.length} files, ${zip.length} bytes)`);
  console.log('  → upload this ZIP to the Chrome Web Store');

  if (existsSync(KEY_PEM)) {
    const crx = buildCrx(zip, KEY_PEM, pubKeyDer);
    const crxPath = join(PKG_ROOT, `b-ark-chrome-${version}.crx`);
    writeFileSync(crxPath, crx);
    console.log(`wrote ${relative(PKG_ROOT, crxPath)}  (${crx.length} bytes)`);
    console.log('  → signed CRX3 for self-hosted / drag-to-install');
  } else {
    console.log('\nkey.pem not found — skipped CRX. (ZIP is all the Web Store needs.)');
  }
}

main();

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure Web Crypto helpers — no Cloudflare-specific API, so directly unit-testable in plain
// Node/Vitest (Node's global `crypto.subtle` is the same Web Crypto API the Worker runtime
// provides). Two independent jobs, both from notification-service.md's "Security notes":
//   - `read_token` at rest: AES-256-GCM under one static Worker secret, random nonce per row.
//   - the per-registration bearer `registrationSecret`: generated once, never stored — only its
//     SHA-256 hash is persisted, and PATCH/DELETE/refresh-preferences compare against that hash.

const AES_ALGO = 'AES-GCM';
const NONCE_BYTES = 12; // 96-bit, the standard/recommended AES-GCM nonce size

// Exported — src/fcm.ts reuses these for the JWT's base64url segments and for decoding the
// service account's PEM private key, rather than duplicating a second byte<->base64 helper pair.
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** JWT/FCM's flavour of base64 — URL-safe alphabet, no padding. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh registration id — not secret, just needs to be unique and URL-safe. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** The opaque bearer secret returned once at registration time (POST /v1/registrations). Never
 * stored by the service itself — only `hashSecret()`'s output is. */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

/** Constant-time comparison of two hex digests — PATCH/DELETE/refresh-preferences must not leak
 * how many leading characters of a guessed secret's hash matched via response-time differences.
 * Both inputs are always the fixed-length output of hashSecret() in practice, but this still
 * compares length first without early-exiting the byte loop on a mismatch. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Imports the base64-encoded 32-byte `READ_TOKEN_ENCRYPTION_KEY` Worker secret as an AES-GCM
 * CryptoKey. Called once per request that needs it (Workers have no long-lived module-scope
 * state to safely cache across invocations anyway). */
export function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(base64Key), AES_ALGO, false, [
    'encrypt',
    'decrypt',
  ]);
}

export interface EncryptedToken {
  ciphertext: string;
  nonce: string;
}

export async function encryptReadToken(plaintext: string, key: CryptoKey): Promise<EncryptedToken> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array(cipherBuf)), nonce: toBase64(nonce) };
}

export async function decryptReadToken(encrypted: EncryptedToken, key: CryptoKey): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64(encrypted.nonce) },
    key,
    fromBase64(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * vc-admin-control S2 (VA2): AES-256-GCM for the secrets the admin console stores in Mongo.
 *
 * `encryptSecret(plain, key32)` returns `{iv, tag, ct}` (base64 strings) with a fresh random 12-byte iv
 * per call; `decryptSecret(enc, key32)` returns the plaintext or THROWS. Any tamper (a flipped bit in
 * iv, tag or ct, a truncated or padded tag, a wrong key) throws; nothing ever returns a partial
 * plaintext. The master key is base64 of exactly 32 bytes (`VC_ADMIN_MASTER_KEY`), refused otherwise.
 *
 * Error messages name the env var and the rule, never a key, a plaintext or a ciphertext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const MASTER_KEY_ENV = "VC_ADMIN_MASTER_KEY";
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

/** The stored form of one secret: three base64 strings. Never plaintext. */
export interface EncryptedSecret {
  iv: string;
  tag: string;
  ct: string;
}

export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsError";
  }
}

/** Strict base64: canonical padding, no whitespace or URL-safe alphabet, so a re-encode equals the input. */
function decodeBase64(text: unknown, what: string): Buffer {
  if (typeof text !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new SecretsError(`${what} is not base64`);
  const bytes = Buffer.from(text, "base64");
  if (bytes.toString("base64") !== text) throw new SecretsError(`${what} is not canonical base64`);
  return bytes;
}

/** Parses `VC_ADMIN_MASTER_KEY`: base64 of EXACTLY 32 bytes, else throws (refused at startup / construction). */
export function parseMasterKey(value: unknown): Buffer {
  let bytes: Buffer;
  try {
    bytes = decodeBase64(value, MASTER_KEY_ENV);
  } catch {
    throw new SecretsError(`${MASTER_KEY_ENV} must be base64 of exactly ${KEY_BYTES} bytes`);
  }
  if (bytes.length !== KEY_BYTES) throw new SecretsError(`${MASTER_KEY_ENV} must be base64 of exactly ${KEY_BYTES} bytes`);
  return bytes;
}

function requireKey(key: unknown): Buffer {
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new SecretsError(`key must be exactly ${KEY_BYTES} bytes`);
  return Buffer.from(key);
}

export function encryptSecret(plain: string, key32: Uint8Array): EncryptedSecret {
  if (typeof plain !== "string") throw new SecretsError("plaintext must be a string");
  const key = requireKey(key32);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

export function decryptSecret(enc: EncryptedSecret, key32: Uint8Array): string {
  const key = requireKey(key32);
  if (enc === null || typeof enc !== "object") throw new SecretsError("decryption failed");
  const keys = Object.keys(enc).sort().join(",");
  if (keys !== "ct,iv,tag") throw new SecretsError("decryption failed");
  try {
    const iv = decodeBase64(enc.iv, "iv");
    const tag = decodeBase64(enc.tag, "tag");
    const ct = decodeBase64(enc.ct, "ct");
    // Node accepts a shorter GCM tag unless the length is pinned: pin it, and pin the iv length.
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretsError("decryption failed");
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretsError("decryption failed");
  }
}

/** True for the exact stored shape (three base64 strings, right lengths). Does not prove it decrypts. */
export function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (value === null || typeof value !== "object") return false;
  if (Object.keys(value).sort().join(",") !== "ct,iv,tag") return false;
  try {
    const v = value as EncryptedSecret;
    return decodeBase64(v.iv, "iv").length === IV_BYTES && decodeBase64(v.tag, "tag").length === TAG_BYTES && decodeBase64(v.ct, "ct") !== undefined;
  } catch {
    return false;
  }
}

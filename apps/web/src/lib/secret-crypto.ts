import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = "autom-org-secret-v1";

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  const material =
    typeof secret === "string" && secret.length >= 32
      ? secret
      : "dev-only-session-secret-change-in-production-32chars";
  return scryptSync(material, SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(blob: string): string | null {
  try {
    const buf = Buffer.from(blob, "base64url");
    if (buf.length <= IV_LEN + TAG_LEN) {
      return null;
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

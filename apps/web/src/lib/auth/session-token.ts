export const SESSION_COOKIE = "automationai_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type SessionPayload = {
  userId: string;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret === "string" && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (min 32 characters) in production");
  }
  return "dev-only-session-secret-change-in-production-32chars";
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256Base64url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64urlEncode(new Uint8Array(signature));
}

async function signPayload(payload: SessionPayload): Promise<string> {
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256Base64url(getSessionSecret(), body);
  return `${body}.${sig}`;
}

export async function createSessionToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  return signPayload({ userId, exp });
}

export async function parseSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (token === undefined || token.trim().length === 0) {
    return null;
  }

  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSha256Base64url(getSessionSecret(), body);
  const sigBytes = base64urlDecode(sig);
  const expectedBytes = base64urlDecode(expected);
  if (!timingSafeEqual(sigBytes, expectedBytes)) {
    return null;
  }

  try {
    const json = new TextDecoder().decode(base64urlDecode(body));
    const parsed = JSON.parse(json) as SessionPayload;
    if (typeof parsed.userId !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (salt === undefined || hashHex === undefined || salt.length === 0 || hashHex.length === 0) {
    return false;
  }
  let derived: Buffer;
  let expected: Buffer;
  try {
    derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expected, derived);
}

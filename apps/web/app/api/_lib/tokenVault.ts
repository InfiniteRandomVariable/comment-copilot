import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getTokenEncryptionKey() {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  return createHash("sha256").update(raw).digest();
}

export function sealToken(token: string) {
  if (!token) {
    throw new Error("Cannot seal empty token");
  }

  const iv = randomBytes(12);
  const key = getTokenEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function unsealToken(tokenRef: string) {
  const parts = tokenRef.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported token reference format");
  }

  const [, ivEncoded, tagEncoded, payloadEncoded] = parts;
  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(tagEncoded, "base64url");
  const payload = Buffer.from(payloadEncoded, "base64url");

  const decipher = createDecipheriv(ALGORITHM, getTokenEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);

  return decrypted.toString("utf8");
}

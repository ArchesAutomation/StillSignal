import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
} from "node:crypto";
import { Buffer } from "node:buffer";
import type { BrokerCredentials } from "./model";
const key = () => {
  const value = Buffer.from(process.env.BROKER_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32) throw new Error("NOT_CONFIGURED");
  return value;
};
export function encryptCredentials(credentials: BrokerCredentials) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64"))
    .join(".");
}
export function decryptCredentials(value: string): BrokerCredentials {
  const [iv, tag, data] = value.split(".").map((v) => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
  );
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(record[k]))
      .join(",") +
    "}"
  );
}
export function snapSignature(
  path: string,
  query: string,
  content: unknown,
  secret: string,
) {
  const normalized =
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    Object.keys(content).length === 0
      ? null
      : (content ?? null);
  return createHmac("sha256", secret)
    .update(canonicalJson({ content: normalized, path, query }))
    .digest("base64");
}
export function trustedPortal(url: string) {
  const value = new URL(url);
  if (
    value.protocol !== "https:" ||
    !["app.snaptrade.com", "connect.snaptrade.com"].includes(value.hostname)
  )
    throw new Error("INVALID_PORTAL");
  return value.href;
}
export function accountIdentity(
  userId: string,
  institution: string,
  number: string,
) {
  return digest(
    canonicalJson([
      userId,
      institution.toLowerCase().replace(/[^a-z0-9]/g, ""),
      number.replace(/\s/g, ""),
    ]),
  );
}

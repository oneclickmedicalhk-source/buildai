import crypto from "node:crypto"

type Envelope = {
  v: 1
  iv: string
  tag: string
  data: string
}

function secretKeyBytes(): Buffer {
  const raw = process.env.PUBLISH_COOKIE_SECRET?.trim()
  if (!raw) {
    throw new Error("Missing PUBLISH_COOKIE_SECRET (set a long random secret).")
  }
  // Derive a stable 32-byte key.
  return crypto.createHash("sha256").update(raw).digest()
}

export function encryptJson(obj: unknown): string {
  const key = secretKeyBytes()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8")
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const env: Envelope = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: enc.toString("base64url"),
  }
  return Buffer.from(JSON.stringify(env), "utf8").toString("base64url")
}

export function decryptJson<T>(token: string): T {
  const key = secretKeyBytes()
  const raw = Buffer.from(token, "base64url").toString("utf8")
  const env = JSON.parse(raw) as Envelope
  if (!env || env.v !== 1) throw new Error("Invalid token envelope")
  const iv = Buffer.from(env.iv, "base64url")
  const tag = Buffer.from(env.tag, "base64url")
  const data = Buffer.from(env.data, "base64url")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(dec.toString("utf8")) as T
}


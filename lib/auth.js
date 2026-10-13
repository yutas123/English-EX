// 共通パスワード認証: Cookie = "<有効期限ms>.<HMAC-SHA256(期限, AUTH_SECRET)>"
export const COOKIE = "ex_auth";
export const MAX_AGE = 60 * 60 * 24 * 90; // 90日

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function makeToken() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${await sign(exp)}`;
}

export async function verifyToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = await sign(exp);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input) {
  const pw = process.env.APP_PASSWORD;
  if (!pw || typeof input !== "string") return false;
  const [a, b] = await Promise.all([input, pw].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

import { NextResponse } from "next/server";
import { COOKIE, MAX_AGE, makeToken, passwordMatches } from "../../../lib/auth.js";

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 800)); // 総当たり対策の遅延
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return res;
}

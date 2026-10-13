import { NextResponse } from "next/server";
import { COOKIE, verifyToken } from "./lib/auth.js";

// ログイン画面とログインAPI以外はすべて（public/ の音声・データも含めて）認証必須
const OPEN = new Set(["/login.html", "/api/login", "/style.css"]);

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();
  if (await verifyToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname === "/" || pathname.endsWith(".html")) return NextResponse.redirect(new URL("/login.html", req.url));
  return new NextResponse("Unauthorized", { status: 401 });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

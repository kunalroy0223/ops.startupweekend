import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

/** Clears the session cookie and returns to sign-in with a reason. Only ever signs out; safe as GET. */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason");
  const url = new URL("/login", req.nextUrl.origin);
  if (reason && /^[a-z_]{1,32}$/.test(reason)) url.searchParams.set("reason", reason);
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

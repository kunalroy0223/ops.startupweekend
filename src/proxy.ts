import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/invite/", "/api/"];

/**
 * Optimistic routing check only: redirects requests without a session cookie.
 * The real verification (signature, revocation, account status, role, scope)
 * happens in the server data layer on every request.
 */
export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.has("__session")) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|partners/|favicon.ico|icon.png|robots.txt).*)"],
};

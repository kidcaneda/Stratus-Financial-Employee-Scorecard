import { NextRequest, NextResponse } from "next/server";

// ============================================================
// Route protection. Firebase Auth is client-SDK based, so the
// canonical session check happens client-side in the (dashboard)
// layout. This middleware adds a coarse server-side guard: it
// checks for a session cookie before serving protected routes,
// redirecting unauthenticated requests to /login.
//
// The cookie ("__session") is set client-side after login (see
// useAuth). Fine-grained role gating (/admin, /team) is enforced
// in each route's layout AND in Firestore rules — never trust the
// client alone.
// ============================================================

const PROTECTED = ["/dashboard", "/departments", "/team", "/scorecard", "/admin", "/settings"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const session = req.cookies.get("__session")?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/departments/:path*",
    "/team/:path*",
    "/scorecard/:path*",
    "/admin/:path*",
    "/settings/:path*",
  ],
};

import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { Actor } from "@/domain/authz";
import { ConfigurationError, serverEnv } from "./env";
import { resolveSession, SESSION_COOKIE } from "./session";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const forbidden = (message = "You do not have permission to do this.") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

export interface RequestContext {
  requestId: string;
}

type Handler<P> = (req: NextRequest, ctx: RequestContext & { params: P }) => Promise<Response>;

/** Wraps a route handler with uniform error mapping. Never leaks internals. */
export function route<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const params = segment?.params ? await segment.params : ({} as P);
      return await handler(req, { requestId, params });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: { code: err.code, message: err.message, fields: err.fields }, requestId }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
        return NextResponse.json({ error: { code: "validation_failed", message: "Check the highlighted fields.", fields }, requestId }, { status: 422 });
      }
      if (err instanceof ConfigurationError) {
        console.error(`[${requestId}]`, err.message);
        return NextResponse.json({ error: { code: "not_configured", message: "The server is not fully configured yet." }, requestId }, { status: 503 });
      }
      console.error(`[${requestId}] unhandled`, err);
      return NextResponse.json({ error: { code: "internal", message: "Something went wrong. Try again." }, requestId }, { status: 500 });
    }
  };
}

/** CSRF defence for cookie-authenticated mutations: the Origin must be this app. */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(serverEnv().APP_URL).origin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) throw new ApiError(403, "bad_origin", "Cross-origin request rejected.");
}

export async function requireApiActor(req: NextRequest): Promise<Actor> {
  assertSameOrigin(req);
  const session = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session.state === "anonymous") throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  if (session.state === "inactive") throw new ApiError(403, "account_inactive", "Your account is not active.");
  return session.actor;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be JSON.");
  }
  return schema.parse(raw);
}

export const ok = (data: unknown, status = 200) => NextResponse.json({ data }, { status });

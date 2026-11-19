"use client";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** JSON fetch against this app's API. Throws ApiClientError with the server's safe message. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "network", "You appear to be offline. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string; fields?: Record<string, string> } };
  if (!res.ok) {
    // Full reload on an expired session so no stale client state survives.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) window.location.assign("/login?reason=expired");
    throw new ApiClientError(res.status, json.error?.code ?? "error", json.error?.message ?? "Something went wrong. Try again.", json.error?.fields ?? {});
  }
  return json.data as T;
}

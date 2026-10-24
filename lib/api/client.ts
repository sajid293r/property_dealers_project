import { API_URL, supabase } from "@/lib/supabase";

/** An error from the PropIQ API, with a message that is already written for a person to read. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** The company the request is for. Sent as X-Company-Id; the server checks the person belongs to it. */
  companyId?: string;
  /** Send the same key again on a retry and the server will not do the action twice. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * The only place the app talks to the PropIQ API. It attaches the signed-in person's token and the active
 * company, and turns every failure into an ApiError whose message can be shown as is.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, "not_configured", "The live connection is not set up.");
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "not_signed_in", "Please sign in to continue.");

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.companyId) headers["x-company-id"] = opts.companyId;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "unreachable", "Cannot reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: handled below */
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Something went wrong. Please try again.", e?.details, e?.requestId);
  }
  return json as T;
}

/** Fetch a file (a photo, a PDF) with the person's sign-in, for opening or saving. Returns the bytes and the file's type. */
export async function apiBlob(path: string, opts: { companyId?: string } = {}): Promise<{ blob: Blob; type: string }> {
  if (!API_URL) throw new ApiError(0, "not_configured", "The live connection is not set up.");
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "not_signed_in", "Please sign in to continue.");
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (opts.companyId) headers["x-company-id"] = opts.companyId;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError(0, "unreachable", "Cannot reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new ApiError(res.status, "error", res.status === 404 ? "That file is no longer available." : "Could not open the file.");
  const blob = await res.blob();
  return { blob, type: res.headers.get("content-type") ?? blob.type };
}

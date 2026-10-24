import type { FastifyInstance, InjectOptions } from "fastify";

/**
 * Hands one web-standard Request to the API and returns its answer as a web-standard Response. This is all a serverless
 * host needs: no listening port. `prefix` is where the host mounts the API (Netlify: /api), removed before routing.
 */
export async function bridge(app: FastifyInstance, req: Request, prefix = "/api"): Promise<Response> {
  const url = new URL(req.url);
  let path = url.pathname;
  if (prefix && (path === prefix || path.startsWith(prefix + "/"))) path = path.slice(prefix.length) || "/";

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const payload = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;

  const options: InjectOptions = { method: req.method as InjectOptions["method"], url: path + url.search, headers, payload: payload && payload.length ? payload : undefined };
  const res = await app.inject(options);

  const out = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || key === "content-length" || key === "transfer-encoding" || key === "connection") continue;
    if (Array.isArray(value)) for (const v of value) out.append(key, String(v));
    else out.set(key, String(value));
  }
  const noBody = res.statusCode === 204 || res.statusCode === 304 || res.rawPayload.length === 0;
  return new Response(noBody ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers: out });
}

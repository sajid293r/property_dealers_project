// The PropIQ API as a Netlify Function, served on the same address as the website under /api.
// (Same address = no cross-site calls, so no CORS to configure.) See docs/GO_LIVE.md.
import { getApp } from "../../api/src/handler.js";
import { bridge } from "../../api/src/bridge.js";

export default async (req: Request): Promise<Response> => bridge(await getApp(), req, "/api");

export const config = { path: "/api/*" };

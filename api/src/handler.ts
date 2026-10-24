import type { FastifyInstance } from "fastify";
import { loadConfig } from "./config.js";
import { createVerifier } from "./auth.js";
import { Db } from "./db.js";
import { buildApp } from "./app.js";
import { loadCnicKeys } from "./cnic.js";

let app: Promise<FastifyInstance> | null = null;

/**
 * The API for a serverless host (Netlify Functions): built once from the environment, then reused by every request
 * that lands on the same warm instance. server.ts is the long-running version (a container or your own machine).
 */
export function getApp(env: Record<string, string | undefined> = process.env): Promise<FastifyInstance> {
  app ??= (async () => {
    const config = loadConfig(env);
    const instance = buildApp({ config, db: Db.create(config), verifier: createVerifier(config), cnic: loadCnicKeys(env) });
    await instance.ready();
    return instance;
  })();
  return app;
}

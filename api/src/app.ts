import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Config } from "./config.js";
import type { TokenVerifier } from "./auth.js";
import { Db } from "./db.js";
import { createGuards } from "./context.js";
import { toProblem } from "./errors.js";
import { systemRoutes } from "./routes/system.js";
import { propertyRoutes } from "./routes/properties.js";
import { bookingRoutes } from "./routes/bookings.js";
import { receiptRoutes } from "./routes/receipts.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { expenseRoutes } from "./routes/expenses.js";
import { crmRoutes } from "./routes/crm.js";
import { billingRoutes } from "./routes/billing.js";
import { hrRoutes } from "./routes/hr.js";
import { constructionRoutes } from "./routes/construction.js";
import { adminRoutes } from "./routes/admin.js";
import { budgetRoutes } from "./routes/budgets.js";
import { auditRoutes } from "./routes/audit.js";
import { collectionRoutes } from "./routes/collections.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { propertyExtraRoutes } from "./routes/propertyExtras.js";
import { salesOpsRoutes } from "./routes/salesops.js";
import { catalogRoutes } from "./routes/catalog.js";
import { partyRoutes } from "./routes/parties.js";
import { accountingRoutes } from "./routes/accounting.js";
import { voucherRoutes } from "./routes/vouchers.js";
import { bankingRoutes } from "./routes/banking.js";
import type { CnicKeys } from "./cnic.js";

export interface AppDeps {
  config: Pick<Config, "LOG_LEVEL"> & Partial<Pick<Config, "CORS_ORIGIN">>;
  db: Db;
  verifier: TokenVerifier;
  /** Keys for storing CNICs safely; without them a CNIC is refused rather than stored in the clear. */
  cnic?: CnicKeys | null;
}

/** Builds the HTTP app. Pure wiring: the rules live in the database, the routes only translate. */
export function buildApp({ config, db, verifier, cnic = null }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: config.LOG_LEVEL === "silent" ? false : { level: config.LOG_LEVEL, redact: ["req.headers.authorization"] },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_000_000,
  });

  // The browser app lives at a different address than the API, so it must be allowed to call it. Only the origins
  // listed in CORS_ORIGIN are allowed (none configured = no browser access at all).
  const origins = (config.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  void app.register(cors, {
    origin: origins.length ? origins : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-company-id", "idempotency-key"],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", String(req.id));
    reply.header("cache-control", "no-store");
  });

  // One place turns every failure into a clear answer; nothing technical reaches the person.
  app.setErrorHandler((err, req, reply) => {
    const problem = toProblem(err);
    if (problem.status >= 500) { req.log.error({ err }, "request failed"); if (process.env.VITEST) console.log("ERR", (err as Error).message); }
    else req.log.info({ code: problem.code }, problem.message);
    void reply.code(problem.status).send({ error: { code: problem.code, message: problem.message, details: problem.details, requestId: req.id } });
  });
  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({ error: { code: "not_found", message: "There is nothing at this address.", requestId: req.id } });
  });

  const guards = createGuards(db, verifier);
  systemRoutes(app, db, guards);
  catalogRoutes(app, db, guards);
  propertyRoutes(app, db, guards);
  bookingRoutes(app, db, guards);
  receiptRoutes(app, db, guards);
  dashboardRoutes(app, db, guards);
  expenseRoutes(app, db, guards);
  crmRoutes(app, db, guards);
  billingRoutes(app, db, guards);
  hrRoutes(app, db, guards);
  constructionRoutes(app, db, guards);
  adminRoutes(app, db, guards);
  budgetRoutes(app, db, guards);
  auditRoutes(app, db, guards);
  collectionRoutes(app, db, guards);
  attachmentRoutes(app, db, guards);
  propertyExtraRoutes(app, db, guards);
  salesOpsRoutes(app, db, guards);
  partyRoutes(app, db, guards, cnic);
  accountingRoutes(app, db, guards);
  voucherRoutes(app, db, guards);
  bankingRoutes(app, db, guards);
  return app;
}

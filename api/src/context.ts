import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser, TokenVerifier } from "./auth.js";
import { InvalidToken } from "./auth.js";
import type { Db, TenantContext } from "./db.js";
import { AppError } from "./errors.js";
import { featureFor, requirePlan, type Plan } from "./plans.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `signedIn`: who is calling. */
    auth?: AuthUser;
    /** Set by `inCompany`: who is calling, inside which company, allowed to do what. */
    ctx?: TenantContext;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = [
  ["can_view", "view"],
  ["can_create", "create"],
  ["can_edit", "edit"],
  ["can_delete", "delete"],
  ["can_approve", "approve"],
] as const;

export interface Guards {
  /** The caller must be signed in (no company needed). */
  signedIn: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** The caller must be signed in AND an active member of the company in `X-Company-Id`, holding `permission`. */
  inCompany: (permission?: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createGuards(db: Db, verifier: TokenVerifier, cacheSeconds = 0): Guards {
  const cacheMs = cacheSeconds * 1000;
  /** people we have already registered (and matched against pending invitations) on this instance */
  const known = new Map<string, number>();
  type Found = { member: { role_id: string; status: string; company_status: string; plan: Plan }; grants: Record<string, string | boolean>[] } | null;
  const memberships = new Map<string, { at: number; found: Found }>();

  async function authenticate(req: FastifyRequest): Promise<AuthUser> {
    const header = req.headers.authorization;
    if (!header?.toLowerCase().startsWith("bearer ")) {
      throw new AppError(401, "not_signed_in", "Please sign in to continue.");
    }
    let user: AuthUser;
    try {
      user = await verifier.verify(header.slice(7).trim());
    } catch (err) {
      if (err instanceof InvalidToken) throw new AppError(401, "invalid_sign_in", "Your sign-in has expired. Please sign in again.");
      throw err;
    }
    // First time we see this person: create their profile row. The id is Supabase's, so the two stay linked.
    if (!user.email) throw new AppError(401, "email_required", "Your sign-in has no email address, which PropIQ needs.");
    const seen = known.get(user.userId);
    if (!cacheMs || !seen || seen < Date.now()) {
      await db.asUser(user.userId, async (q) => {
        await q.query(
          `insert into users (id, email, full_name) values ($1, $2, coalesce($3, $2)) on conflict (id) do nothing`,
          [user.userId, user.email, user.fullName],
        );
        // anyone invited by email joins the company the first time they sign in
        await q.query(`select app.accept_invites($1, $2)`, [user.userId, user.email]);
      });
      if (cacheMs) known.set(user.userId, Date.now() + cacheMs * 15);
    }
    req.auth = user;
    return user;
  }

  const signedIn: Guards["signedIn"] = async (req) => {
    await authenticate(req);
  };

  const inCompany: Guards["inCompany"] = (permission) => async (req) => {
    const user = await authenticate(req);
    const raw = req.headers["x-company-id"];
    const companyId = Array.isArray(raw) ? raw[0] : raw;
    if (!companyId || !UUID.test(companyId)) {
      throw new AppError(400, "company_required", "Choose a company first (X-Company-Id header).");
    }

    // Membership and permissions come from our tables, read as the person themselves. A person who is not a member
    // gets exactly the same answer as a company that does not exist, so ids cannot be probed.
    const cacheKey = `${user.userId}:${companyId.toLowerCase()}`;
    const cached = cacheMs ? memberships.get(cacheKey) : undefined;
    const found: Found = cached && Date.now() - cached.at < cacheMs ? cached.found : await db.asUser(user.userId, async (q) => {
      const member = await q.query<{ role_id: string; status: string; company_status: string; plan: Plan }>(
        `select cm.role_id, cm.status, c.status as company_status, app.company_plan(c.id) as plan
           from company_members cm join companies c on c.id = cm.company_id
          where cm.user_id = app.current_user_id() and cm.company_id = $1`,
        [companyId],
      );
      const m = member.rows[0];
      if (!m) return null;
      const grants = await q.query<Record<string, string | boolean>>(
        `select module, can_view, can_create, can_edit, can_delete, can_approve from role_permissions where role_id = $1`,
        [m.role_id],
      );
      return { member: m, grants: grants.rows };
    });
    // only a positive answer is remembered, so newly granted access shows up at once; a removal takes effect within the cache time
    if (cacheMs && found && !(cached && Date.now() - cached.at < cacheMs)) memberships.set(cacheKey, { at: Date.now(), found });
    if (!found || found.member.status !== "active" || found.member.company_status !== "active") {
      throw new AppError(403, "no_access", "You do not have access to this company.");
    }

    const permissions: string[] = [];
    for (const g of found.grants) for (const [col, action] of ACTIONS) if (g[col] === true) permissions.push(`${g.module}.${action}`);

    if (permission && !permissions.includes(permission)) {
      throw new AppError(403, "not_permitted", `Your role does not allow this (${permission}).`);
    }
    const plan = found.member.plan ?? "basic";
    // the plan decides which parts of the product this company may use (the website only hides what the server refuses)
    const feature = featureFor(req.url.split("?")[0] ?? "");
    if (feature) requirePlan(plan, feature.tier, feature.name);
    req.ctx = { userId: user.userId, companyId: companyId.toLowerCase(), permissions, requestId: String(req.id), plan };
  };

  return { signedIn, inCompany };
}

/** Routes call this to get the context the guard prepared. */
export function ctxOf(req: FastifyRequest): TenantContext {
  if (!req.ctx) throw new AppError(500, "internal_error", "Route is missing its company guard.");
  return req.ctx;
}

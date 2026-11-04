// QA run 1 (scratch, not part of the product): plans, permissions, isolation, validation, money, state machines.
// Runs the real API over an in-memory Postgres using the test harness. Prints one JSON line per check.
import { ID, startHarness, type Harness } from "../test/helpers.js";
import { MODULE_KEYS } from "../src/roles.js";

const out: { id: string; name: string; ok: boolean; note: string }[] = [];
async function t(id: string, name: string, fn: () => Promise<[boolean, string?]>) {
  try {
    const [ok, note] = await fn();
    out.push({ id, name, ok, note: note ?? "" });
  } catch (e) {
    out.push({ id, name, ok: false, note: "THREW " + (e as Error).message });
  }
  const r = out[out.length - 1]!;
  console.log(JSON.stringify(r));
}
const U = (n: number) => `a2000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ORG_B = "00000000-0000-0000-0000-0000000000b1", ORG_P = "00000000-0000-0000-0000-0000000000b2";
const CO_B = "00000000-0000-0000-0000-0000000000d1", CO_P = "00000000-0000-0000-0000-0000000000d2";
const ROLE_B = "b3000000-0000-0000-0000-000000000001", ROLE_P = "b3000000-0000-0000-0000-000000000002";
const OWN_B = U(1), OWN_P = U(2), OUTSIDER = U(3);
const emails: Record<string, string> = { [OWN_B]: "basic@x.pk", [OWN_P]: "pro@x.pk", [OUTSIDER]: "out@x.pk" };

const h: Harness = await startHarness();
await h.admin(async (c) => {
  await c.query(`
    insert into organizations(id,name,slug,plan,extra_seats) values ('${ORG_B}','Basic Org','basic-org','basic',0),('${ORG_P}','Pro Org','pro-org','moderate',0);
    insert into companies(id,org_id,name) values ('${CO_B}','${ORG_B}','Basic Co'),('${CO_P}','${ORG_P}','Pro Co');
    insert into users(id,email,full_name) values ('${OWN_B}','basic@x.pk','Basic Owner'),('${OWN_P}','pro@x.pk','Pro Owner'),('${OUTSIDER}','out@x.pk','Outsider');
    insert into roles(id,org_id,name,is_system) values ('${ROLE_B}','${ORG_B}','Owner',true),('${ROLE_P}','${ORG_P}','Owner',true);
    insert into company_members(company_id,user_id,role_id) values ('${CO_B}','${OWN_B}','${ROLE_B}'),('${CO_P}','${OWN_P}','${ROLE_P}');
  `);
  for (const role of [ID.roleOwner, ROLE_B, ROLE_P])
    for (const m of MODULE_KEYS)
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company') on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`, [role, m]);
  await c.query(`select app.seed_company_defaults('${CO_B}'), app.seed_company_defaults('${CO_P}')`);
});
const call = (method: any, url: string, as: string, company: string | null, body?: unknown, headers?: Record<string, string>) => h.call(method, url, { as, company, body, headers });
// h.call only knows e-mails of the harness users; patch by passing our own token
async function raw(method: string, url: string, userId: string | null, company: string | null, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (userId) headers.authorization = `Bearer ${await h.token(userId, emails[userId] ?? "alice@a.pk")}`;
  if (company) headers["x-company-id"] = company;
  const res = await h.app.inject({ method: method as any, url, headers, ...(body !== undefined ? { payload: body as object } : {}) });
  let b: any = null;
  try { b = res.body ? JSON.parse(res.body) : null; } catch { b = res.body; }
  return { status: res.statusCode, body: b, headers: res.headers };
}
const A = ID.coA, alice = ID.alice;

const leaf = (await raw("GET", "/v1/accounts", alice, A)).body.filter((a: any) => !(a.isGroup ?? a.is_group));
const v = (await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-09-20", description: "QA del", lines: [{ accountId: leaf[0].id, debit: "777" }, { accountId: leaf[1].id, credit: "777" }] })).body;
await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A); await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {});
const del = await raw("DELETE", `/v1/vouchers/${v.id}`, alice, A);
const rec = await h.admin(async (c) => (await c.query(`select * from v_reconciliation`)).rows);
const st = await h.admin(async (c) => (await c.query(`select v.number, v.status, v.journal_entry_id is not null as has_entry, (select count(*) from journal_entries e where e.source_id = v.id) as entries from vouchers v where v.id = $1`, [v.id])).rows[0]);
const rev = await h.admin(async (c) => (await c.query(`select count(*)::int n from journal_entries where description ilike '%' || $1 || '%' and description ilike '%void%'`, [v.number ?? "x"])).rows[0]);
console.log("RESULT delete", del.status, "voucher", JSON.stringify(st), "reversal entries", JSON.stringify(rev), "v_reconciliation rows", rec.length, JSON.stringify(rec).slice(0, 300));
const again = await raw("POST", `/v1/vouchers/${v.id}/void`, alice, A, { reason: "QA fix attempt" }); console.log("RESULT proper void afterwards →", again.status, again.body?.error?.message);
await h.close(); process.exit(0);

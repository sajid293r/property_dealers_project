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

const aBank = (await raw("POST", "/v1/bank-accounts", alice, A, { accountTitle: "A Bank", accountNo: "A-12345", bankName: "Meezan Bank" })).body;
await t("H9c", "Bank statement import: valid, re-import, zero line, 2001 lines, malformed", async () => {
  const body = (lines: any[], extra: any = {}) => ({ label: "QA stmt", periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "19949.50", lines, ...extra });
  const L = [{ date: "2026-11-10", description: "QA deposit", reference: "QA-001", deposit: "20000" }, { date: "2026-11-11", description: "QA fee", withdrawal: "50.50" }];
  const a = await raw("POST", `/v1/bank-accounts/${aBank.body?.id ?? aBank.id}/statements`, alice, A, body(L));
  const b = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, body(L));
  const z = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, body([{ date: "2026-11-10", description: "zero line" }]));
  const big = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, body(Array.from({ length: 2001 }, (_, i) => ({ date: "2026-11-10", deposit: "1" }))));
  const wrongClose = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, body(L, { closingBalance: "1" }));
  const mal = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, { periodFrom: "2026-13-01", lines: "x" });
  return [a.status === 201 && a.body.linesAddUp === true, `valid ${a.status} addsUp=${a.body?.linesAddUp}; identical re-import ${b.status} (creates a second copy: ${b.status === 201}); zero-amount line ${z.status} ${JSON.stringify(z.body?.error?.message)} ${JSON.stringify(z.body?.error?.details)}; 2001 lines ${big.status}; wrong closing balance ${wrongClose.status} addsUp=${wrongClose.body?.linesAddUp}; malformed ${mal.status}`];
});
await t("C3d", "Budget of A that points at B's project: what does it reveal / can B see it?", async () => {
  const b = await raw("POST", "/v1/budgets", alice, A, { name: "QA x-project budget", kind: "project", projectId: ID.prjB });
  const g = await raw("GET", `/v1/budgets/${b.body.id}`, alice, A); const inB = await raw("GET", `/v1/budgets`, ID.carol, ID.coB); const inB2 = await raw("GET", `/v1/budgets/${b.body.id}`, ID.carol, ID.coB);
  const row = JSON.stringify(g.body);
  const rowDb = await h.admin(async (c) => (await c.query(`select b.company_id, p.company_id as project_company from budgets b join projects p on p.id = b.project_id where b.id = $1`, [b.body.id])).rows[0]);
  return [rowDb.company_id === rowDb.project_company, `create ${b.status}; DB: budget company ${rowDb.company_id.slice(-2)} vs project company ${rowDb.project_company.slice(-2)}; A reads project name: ${row.match(/"projectName":"[^"]*"|"projectName":null|"project":[^,]*/)?.[0]}; B list contains it: ${JSON.stringify(inB.body).includes("x-project")}; B direct ${inB2.status}`];
});
const pass = out.filter((o) => o.ok).length;
console.log(`\nSUMMARY ${pass}/${out.length} pass`);
await h.close(); process.exit(0);

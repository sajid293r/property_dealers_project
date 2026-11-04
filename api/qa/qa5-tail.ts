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

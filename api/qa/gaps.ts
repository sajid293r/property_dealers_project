import { startHarness } from "../test/helpers.js";
const h = await startHarness();
const r = await h.admin(async (c) => (await c.query(`select child_table, child_column, parent_table from v_tenant_fk_gaps order by 1,2`)).rows);
console.log(r.map((x: any) => `${x.child_table}.${x.child_column}->${x.parent_table}`).join("\n"));
await h.close(); process.exit(0);

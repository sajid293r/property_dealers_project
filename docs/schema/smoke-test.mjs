import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { protectCnic, normalizeCnic, cnicHash, decryptCnic } from "./cnic.mjs";

// Run:  npm i --no-save @electric-sql/pglite && node docs/schema/smoke-test.mjs
// Applies core.sql to an in-memory Postgres (PGlite) and checks the database-level invariants.

const db = new PGlite();
const sql = fs.readFileSync(process.env.CORE_SQL ?? new URL("./core.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log("  PASS", name); };
const bad = (name, e) => { fail++; console.log("  FAIL", name, "->", e?.message ?? e); };

async function expectError(name, fn, match) {
  try { await fn(); bad(name, "no error thrown"); }
  catch (e) { (match ? e.message.includes(match) : true) ? ok(name) : bad(name, e.message); }
}

console.log("Applying core.sql ...");
await db.exec(sql);
// the numbered migrations (api/db/migrations) run after the baseline, exactly as in production
const migDir = new URL("../../api/db/migrations/", import.meta.url);
if (!process.env.CORE_SQL && fs.existsSync(migDir)) {
  for (const f of fs.readdirSync(migDir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) {
    await db.exec(fs.readFileSync(new URL(f, migDir), "utf8"));
    console.log("  migration applied:", f);
  }
}
console.log("  schema applied");

// Setup as superuser (bypasses RLS) — two companies in one org.
await db.exec(`
  create role app_user nologin;
  grant usage on schema public, app to app_user;
  grant select, insert, update, delete on all tables in schema public to app_user;
  grant execute on all functions in schema app to app_user;
  insert into organizations(id,name,slug) values ('00000000-0000-0000-0000-0000000000a1','Group','group');
  insert into companies(id,org_id,name) values
    ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','Co One'),
    ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','Co Two');
`);
const C1 = "00000000-0000-0000-0000-0000000000c1";
const C2 = "00000000-0000-0000-0000-0000000000c2";

async function asCompany(company, fn) {
  await db.exec("begin");
  try {
    await db.exec(`set local role app_user; select set_config('app.company_id','${company}', true)`);
    const r = await fn();
    await db.exec("commit");
    return r;
  } catch (e) { await db.exec("rollback"); throw e; }
}

// CNICs are never stored in clear: the API encrypts them and stores a keyed hash (docs/schema/cnic.mjs)
const KEYS = { hmacKey: Buffer.alloc(32, 7), dataKey: Buffer.alloc(32, 9) };
const AHMED = protectCnic('35201-1234567-1', KEYS);

// Seed company 1
const ids = await asCompany(C1, async () => {
  await db.exec(`
    insert into fiscal_years(id,company_id,name,start_date,end_date) values ('f0000000-0000-0000-0000-000000000001','${C1}','FY2026','2025-07-01','2026-06-30');
    insert into accounting_periods(id,company_id,fiscal_year_id,start_date,end_date) values
      ('e0000000-0000-0000-0000-000000000001','${C1}','f0000000-0000-0000-0000-000000000001','2025-07-01','2025-07-31'),
      ('e0000000-0000-0000-0000-000000000002','${C1}','f0000000-0000-0000-0000-000000000001','2025-08-01','2025-08-31');
    update accounting_periods set status='locked' where id='e0000000-0000-0000-0000-000000000001';
    insert into gl_accounts(id,company_id,code,name,account_class,category,is_group) values
      ('a0000000-0000-0000-0000-000000000001','${C1}','01','Assets','asset','asset',true),
      ('a0000000-0000-0000-0000-000000000002','${C1}','01010001','Cash','asset','asset_cash',false),
      ('a0000000-0000-0000-0000-000000000003','${C1}','03010001','Customer Receivable','asset','asset_receivable',false),
      ('a0000000-0000-0000-0000-000000000004','${C1}','04010001','Property Sales','income','income_sales',false);
    insert into parties(id,company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('b0000000-0000-0000-0000-000000000001','${C1}','Ahmed Khan','${AHMED.cnic_enc}','${AHMED.cnic_hash}','${AHMED.cnic_last4}');
    insert into projects(id,company_id,code,name,type) values ('c0000000-0000-0000-0000-000000000001','${C1}','PRJ-001','Green Valley','residential');
    insert into property_types(id,company_id,code,name,property_group) values
      ('70000000-0000-0000-0000-000000000001','${C1}','plot','Residential Plot','residential'),
      ('70000000-0000-0000-0000-000000000002','${C1}','house','House','residential');
    insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
      ('d0000000-0000-0000-0000-000000000001','${C1}','c0000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','PRP-1000','Plot 1',12000000);
  `);
  return true;
});
ok("seed company 1 under RLS");

console.log("\nLedger invariants");
const entry = (id, no, period, lines, date = '2025-08-10') => asCompany(C1, async () => {
  await db.exec(`insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type) values ('${id}','${C1}','${no}','${date}','${period}','voucher')`);
  for (const [i, l] of lines.entries()) {
    await db.exec(`insert into journal_lines(company_id,entry_id,line_no,account_id,debit,credit) values ('${C1}','${id}',${i + 1},'${l[0]}',${l[1]},${l[2]})`);
  }
});
const CASH = "a0000000-0000-0000-0000-000000000002", SALES = "a0000000-0000-0000-0000-000000000004", GRP = "a0000000-0000-0000-0000-000000000001";
const P2 = "e0000000-0000-0000-0000-000000000002", P1 = "e0000000-0000-0000-0000-000000000001";

await entry("11111111-0000-0000-0000-000000000001", "JV-00001", P2, [[CASH, 500000, 0], [SALES, 0, 500000]]).then(() => ok("balanced entry posts"), (e) => bad("balanced entry posts", e));
await expectError("unbalanced entry is rejected", () => entry("11111111-0000-0000-0000-000000000002", "JV-00002", P2, [[CASH, 100, 0], [SALES, 0, 90]]), "unbalanced");
await expectError("posting to group header is rejected", () => entry("11111111-0000-0000-0000-000000000003", "JV-00003", P2, [[GRP, 100, 0], [SALES, 0, 100]]), "group header");
await expectError("posting into locked period is rejected", () => entry("11111111-0000-0000-0000-000000000004", "JV-00004", P1, [[CASH, 100, 0], [SALES, 0, 100]], "2025-07-10"), "locked");
await expectError("line with both debit and credit is rejected", () => entry("11111111-0000-0000-0000-000000000005", "JV-00005", P2, [[CASH, 100, 100]]));
await expectError("posted line cannot be updated", () => asCompany(C1, () => db.exec(`update journal_lines set debit = 1 where entry_id='11111111-0000-0000-0000-000000000001' and line_no=1`)), "append-only");
await expectError("posted entry cannot be deleted", () => asCompany(C1, () => db.exec(`delete from journal_entries where id='11111111-0000-0000-0000-000000000001'`)), "append-only");
await asCompany(C1, () => db.exec(`update journal_entries set status='reversed' where id='11111111-0000-0000-0000-000000000001'`)).then(() => ok("entry may be marked reversed"), (e) => bad("entry may be marked reversed", e));

const bal = await asCompany(C1, () => db.query(`select account_id, debit_total, credit_total from account_balances order by account_id`));
bal.rows.length === 2 && Number(bal.rows[0].debit_total) === 500000 && Number(bal.rows[1].credit_total) === 500000
  ? ok("account_balances rolled up by trigger") : bad("account_balances rolled up by trigger", JSON.stringify(bal.rows));

console.log("\nSales invariants");
const B1 = "ba000000-0000-0000-0000-000000000001", B2 = "ba000000-0000-0000-0000-000000000002";
const booking = (id, no) => asCompany(C1, () => db.exec(`insert into bookings(id,company_id,booking_no,property_id,customer_id,booking_date,list_price,discount,payment_type,status)
  values ('${id}','${C1}','${no}','d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','2025-08-10',12000000,500000,'installment','pending')`));
await booking(B1, "BK-00001").then(() => ok("first booking on property"), (e) => bad("first booking", e));
await expectError("second live booking on same property is rejected", () => booking(B2, "BK-00002"), "bookings_one_live_per_property");
const nb = await asCompany(C1, () => db.query(`select net_price from bookings where id='${B1}'`));
Number(nb.rows[0].net_price) === 11500000 ? ok("net_price generated column") : bad("net_price", nb.rows[0]);
await asCompany(C1, () => db.exec(`update bookings set status='cancelled' where id='${B1}'`));
await booking(B2, "BK-00002").then(() => ok("property re-bookable after cancellation"), (e) => bad("re-book after cancel", e));

await asCompany(C1, () => db.exec(`insert into installments(id,company_id,booking_id,seq,due_date,amount) values
  ('1a000000-0000-0000-0000-000000000001','${C1}','${B2}',1,'2025-09-01',300000),
  ('1a000000-0000-0000-0000-000000000002','${C1}','${B2}',2,'2025-10-01',300000)`));
await asCompany(C1, () => db.exec(`insert into receipts(id,company_id,receipt_no,customer_id,booking_id,received_on,amount,method,deposit_account)
  values ('2a000000-0000-0000-0000-000000000001','${C1}','RCT-00001','b0000000-0000-0000-0000-000000000001','${B2}','2025-09-01',400000,'cash','${CASH}')`));
await asCompany(C1, () => db.exec(`insert into receipt_allocations(company_id,receipt_id,installment_id,amount) values
  ('${C1}','2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000001',300000),
  ('${C1}','2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000002',100000)`));
const inst = await asCompany(C1, () => db.query(`select seq,status,paid_amount from installments order by seq`));
inst.rows[0].status === "paid" && inst.rows[1].status === "partial" && Number(inst.rows[1].paid_amount) === 100000
  ? ok("allocation marks installment paid / partial") : bad("allocation state", JSON.stringify(inst.rows));
await asCompany(C1, () => db.exec(`insert into installments(id,company_id,booking_id,seq,due_date,amount) values ('1a000000-0000-0000-0000-000000000003','${C1}','${B2}',3,'2025-11-01',300000)`));
await expectError("over-allocating a receipt is rejected", () => asCompany(C1, () => db.exec(`insert into receipt_allocations(company_id,receipt_id,installment_id,amount)
  values ('${C1}','2a000000-0000-0000-0000-000000000001','1a000000-0000-0000-0000-000000000003',250000)`)), "exceed receipt");

console.log("\nTenant isolation (RLS)");
const own = await asCompany(C1, () => db.query(`select count(*)::int n from properties`));
const other = await asCompany(C2, () => db.query(`select count(*)::int n from properties`));
const none = await db.exec("begin; set local role app_user;").then(async () => { const r = await db.query(`select count(*)::int n from properties`); await db.exec("rollback"); return r; });
own.rows[0].n === 1 ? ok("company 1 sees its property") : bad("own rows", own.rows);
other.rows[0].n === 0 ? ok("company 2 sees none of company 1's rows") : bad("isolation", other.rows);
none.rows[0].n === 0 ? ok("no tenant context => no rows") : bad("fail-closed", none.rows);
await expectError("cannot insert a row into another company", () => asCompany(C2, () => db.exec(`insert into parties(company_id,display_name) values ('${C1}','Intruder')`)), "row-level security");
await expectError("duplicate CNIC within a company is rejected", () => asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('${C1}','Dup','${protectCnic('3520112345671', KEYS).cnic_enc}','${AHMED.cnic_hash}','5671')`)), "parties_cnic_uq");
await asCompany(C2, () => db.exec(`insert into parties(company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('${C2}','Same CNIC other company','${protectCnic('3520112345671', KEYS).cnic_enc}','${AHMED.cnic_hash}','5671')`)).then(() => ok("same CNIC allowed in a different company"), (e) => bad("cnic across companies", e));

console.log("\nDocument numbering");
const nums = await asCompany(C1, async () => [
  (await db.query(`select app.next_doc_no('${C1}','CPV','FY2026') n`)).rows[0].n,
  (await db.query(`select app.next_doc_no('${C1}','CPV','FY2026') n`)).rows[0].n,
  (await db.query(`select app.next_doc_no('${C1}','CPV','FY2027') n`)).rows[0].n,
]);
nums.join(",") === "CPV-00001,CPV-00002,CPV-00001" ? ok(`gapless per-period numbering (${nums.join(", ")})`) : bad("numbering", nums);


// ═════════════════════════════════════════════════ Property model (richer than a portal listing)
console.log("\nProperty model");
const PR = "d0000000-0000-0000-0000-000000000001", HOUSE = "70000000-0000-0000-0000-000000000002";
await asCompany(C1, () => db.exec(`
  insert into properties(id,company_id,project_id,type_id,code,title,list_price,purpose,installments_available,possession_status)
    values ('d0000000-0000-0000-0000-000000000002','${C1}','c0000000-0000-0000-0000-000000000001','${HOUSE}','PRP-1001','5 Marla House',25000000,'both',true,'ready');
  insert into property_locations(company_id,property_id,sector,street_no,society,city,latitude,longitude,road_width_ft,facing)
    values ('${C1}','d0000000-0000-0000-0000-000000000002','B','12','Green Valley','Lahore',31.5204,74.3587,40,'north_east');
  insert into property_dimensions(company_id,property_id,size_value,size_unit,size_sqft,covered_area_sqft,frontage_ft,depth_ft,corner)
    values ('${C1}','d0000000-0000-0000-0000-000000000002',5,'marla',1361,2400,25,50,true);
  insert into property_building_specs(company_id,property_id,bedrooms,bathrooms,kitchens,floors_total,parking_spaces,year_built,condition,furnishing)
    values ('${C1}','d0000000-0000-0000-0000-000000000002',4,5,1,2,2,2024,'new','unfurnished');
  insert into amenity_catalog(id,company_id,code,name,category,input_type) values
    ('a1000000-0000-0000-0000-000000000001','${C1}','lift','Lift','building','yes_no'),
    ('a1000000-0000-0000-0000-000000000002','${C1}','parking','Parking spaces','building','number');
  insert into property_amenities(company_id,property_id,amenity_id,value_bool) values ('${C1}','d0000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001',true);
  insert into property_amenities(company_id,property_id,amenity_id,value_num) values ('${C1}','d0000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002',2);
  insert into property_utilities(company_id,property_id,utility,status,provider,meter_no) values ('${C1}','d0000000-0000-0000-0000-000000000002','electricity','available','LESCO','M-1001');
  insert into property_legal(company_id,property_id,ownership_type,title_status,transfer_status,registry_no) values ('${C1}','d0000000-0000-0000-0000-000000000002','freehold','clear','transferable','R-77');
  insert into property_valuations(company_id,property_id,valuation_date,method,value) values ('${C1}','d0000000-0000-0000-0000-000000000002','2025-08-01','market',26000000);
`)).then(() => ok("house with location, dimensions, rooms, amenities, utilities, legal, valuation"), (e) => bad("property detail insert", e));
const q1 = await asCompany(C1, () => db.query(`select p.code, d.size_sqft, b.bedrooms, count(a.id)::int amenities
  from properties p join property_dimensions d on d.property_id=p.id join property_building_specs b on b.property_id=p.id
  left join property_amenities a on a.property_id=p.id where p.id='d0000000-0000-0000-0000-000000000002' group by p.code,d.size_sqft,b.bedrooms`));
q1.rows[0].amenities === 2 && q1.rows[0].bedrooms === 4 ? ok("joined read across detail tables") : bad("joined read", q1.rows);
await expectError("same amenity cannot be added twice to a property", () => asCompany(C1, () => db.exec(`insert into property_amenities(company_id,property_id,amenity_id,value_bool) values ('${C1}','d0000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001',false)`)), "property_amenities");
await expectError("amenity row must carry a value", () => asCompany(C1, () => db.exec(`insert into property_amenities(company_id,property_id,amenity_id) values ('${C1}','${PR}','a1000000-0000-0000-0000-000000000001')`)), "check");
await expectError("negative bedrooms rejected", () => asCompany(C1, () => db.exec(`insert into property_building_specs(company_id,property_id,bedrooms) values ('${C1}','${PR}',-1)`)), "check");
await expectError("latitude out of range rejected", () => asCompany(C1, () => db.exec(`insert into property_locations(company_id,property_id,latitude) values ('${C1}','${PR}',123)`)), "check");
await expectError("one detail row per property (1:1)", () => asCompany(C1, () => db.exec(`insert into property_dimensions(company_id,property_id,size_value,size_unit) values ('${C1}','d0000000-0000-0000-0000-000000000002',6,'marla')`)), "property_dimensions");
await asCompany(C1, () => db.exec(`insert into documents(id,company_id,storage_key,file_name) values ('d1000000-0000-0000-0000-000000000001','${C1}','k1','a.jpg'),('d1000000-0000-0000-0000-000000000002','${C1}','k2','b.jpg');
  insert into property_media(company_id,property_id,kind,file_id,is_cover) values ('${C1}','${PR}','photo','d1000000-0000-0000-0000-000000000001',true)`));
await expectError("only one cover photo per property", () => asCompany(C1, () => db.exec(`insert into property_media(company_id,property_id,kind,file_id,is_cover) values ('${C1}','${PR}','photo','d1000000-0000-0000-0000-000000000002',true)`)), "property_media_one_cover");
await asCompany(C1, () => db.exec(`insert into party_roles(company_id,party_id,role) values ('${C1}','b0000000-0000-0000-0000-000000000001','customer');
  insert into property_ownership_history(company_id,property_id,owner_party_id,acquisition_type,from_date) values ('${C1}','${PR}','b0000000-0000-0000-0000-000000000001','purchase','2024-01-01')`));
await expectError("a property has exactly one current owner", () => asCompany(C1, () => db.exec(`insert into property_ownership_history(company_id,property_id,owner_party_id,acquisition_type,from_date) values ('${C1}','${PR}','b0000000-0000-0000-0000-000000000001','transfer','2025-01-01')`)), "property_one_current_owner");
await asCompany(C1, () => db.exec(`update property_ownership_history set to_date='2024-12-31' where property_id='${PR}';
  insert into property_ownership_history(company_id,property_id,owner_party_id,acquisition_type,from_date) values ('${C1}','${PR}','b0000000-0000-0000-0000-000000000001','transfer','2025-01-01')`)).then(() => ok("ownership chain: close old owner, open new owner"), (e) => bad("ownership chain", e));
await asCompany(C1, () => db.exec(`insert into property_tenancies(company_id,property_id,tenant_party_id,monthly_rent,start_date) values ('${C1}','d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',90000,'2025-09-01')`));
await expectError("only one active tenancy per property", () => asCompany(C1, () => db.exec(`insert into property_tenancies(company_id,property_id,tenant_party_id,monthly_rent,start_date) values ('${C1}','d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',95000,'2025-10-01')`)), "property_one_active_tenancy");
await asCompany(C1, () => db.exec(`insert into property_listings(company_id,property_id,channel,status) values ('${C1}','d0000000-0000-0000-0000-000000000002','zameen','live'),('${C1}','d0000000-0000-0000-0000-000000000002','website','live')`)).then(() => ok("same property listed on several channels"), (e) => bad("multi-channel listing", e));
await expectError("one open listing per channel", () => asCompany(C1, () => db.exec(`insert into property_listings(company_id,property_id,channel,status) values ('${C1}','d0000000-0000-0000-0000-000000000002','zameen','draft')`)), "property_one_open_listing_per_channel");

// ═════════════════════════════════════════════════ Split tenders & multi-target allocation
console.log("\nReceipts: split tenders and multi-target settlement");
const BANK = "a0000000-0000-0000-0000-0000000000b1";
await asCompany(C1, () => db.exec(`insert into gl_accounts(id,company_id,code,name,account_class,category) values ('${BANK}','${C1}','01010002','Bank','asset','asset_bank');
  insert into sales_invoices(id,company_id,number,customer_id,invoice_date,due_date,subtotal,total) values ('5a000000-0000-0000-0000-000000000001','${C1}','INV-00001','b0000000-0000-0000-0000-000000000001','2025-09-01','2025-09-30',100000,100000);
  insert into service_invoices(id,company_id,number,customer_id,due_date,amount) values ('5b000000-0000-0000-0000-000000000001','${C1}','SRV-00001','b0000000-0000-0000-0000-000000000001','2025-09-30',50000);
  insert into installments(id,company_id,booking_id,seq,due_date,amount) values ('1a000000-0000-0000-0000-000000000004','${C1}','${B2}',4,'2025-12-01',200000);`));
// one receipt of 600k: 250k cash + 150k cheque + 200k online, settling an installment, an invoice and a service invoice
const R = "2b000000-0000-0000-0000-000000000001";
await asCompany(C1, () => db.exec(`insert into receipts(id,company_id,receipt_no,customer_id,booking_id,received_on,amount,method) values ('${R}','${C1}','RCT-00002','b0000000-0000-0000-0000-000000000001','${B2}','2025-09-05',350000,'split');
  insert into receipt_tenders(company_id,receipt_id,method,amount,deposit_account) values
    ('${C1}','${R}','cash',200000,'${CASH}'),('${C1}','${R}','cheque',100000,'${BANK}'),('${C1}','${R}','online',50000,'${BANK}');
  insert into receipt_allocations(company_id,receipt_id,installment_id,amount) values ('${C1}','${R}','1a000000-0000-0000-0000-000000000004',200000);
  insert into receipt_allocations(company_id,receipt_id,sales_invoice_id,amount) values ('${C1}','${R}','5a000000-0000-0000-0000-000000000001',100000);
  insert into receipt_allocations(company_id,receipt_id,service_invoice_id,amount) values ('${C1}','${R}','5b000000-0000-0000-0000-000000000001',50000);`)).then(() => ok("one receipt: 3 tenders, settles installment + invoice + service invoice"), (e) => bad("split receipt", e));
const st = await asCompany(C1, () => db.query(`select (select status from installments where id='1a000000-0000-0000-0000-000000000004') i,
  (select status from sales_invoices where id='5a000000-0000-0000-0000-000000000001') s, (select status from service_invoices where id='5b000000-0000-0000-0000-000000000001') v`));
st.rows[0].i === "paid" && st.rows[0].s === "paid" && st.rows[0].v === "paid" ? ok("all three targets marked paid") : bad("targets", st.rows);
await expectError("tenders that do not add up to the receipt are rejected", () => asCompany(C1, () => db.exec(`insert into receipts(id,company_id,receipt_no,customer_id,received_on,amount,method) values ('2b000000-0000-0000-0000-000000000002','${C1}','RCT-00003','b0000000-0000-0000-0000-000000000001','2025-09-06',100000,'split');
  insert into receipt_tenders(company_id,receipt_id,method,amount,deposit_account) values ('${C1}','2b000000-0000-0000-0000-000000000002','cash',60000,'${CASH}')`)), "must add up");
await expectError("a single-method receipt must name its deposit account", () => asCompany(C1, () => db.exec(`insert into receipts(company_id,receipt_no,customer_id,received_on,amount,method) values ('${C1}','RCT-00004','b0000000-0000-0000-0000-000000000001','2025-09-06',1000,'cash')`)), "check");
await expectError("an allocation must have exactly one target", () => asCompany(C1, () => db.exec(`insert into receipt_allocations(company_id,receipt_id,installment_id,sales_invoice_id,amount) values ('${C1}','${R}','1a000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001',1)`)), "check");

// ═════════════════════════════════════════════════ Combined transactions (within one company)
console.log("\nCombined transactions");
// combined items must name a real document: a receipt, a voucher or an invoice being settled
const CT_VOUCHER = "ca000000-0000-0000-0000-0000000000e1";
await asCompany(C1, () => db.exec(`insert into vouchers(id,company_id,voucher_type,number,voucher_date) values ('${CT_VOUCHER}','${C1}','CPV','CPV-CT-1','2025-09-10')`));
const CT_COL = { receipt: "receipt_id", voucher: "voucher_id", invoice_settlement: "sales_invoice_id" };
const CT_DOC = { receipt: "2a000000-0000-0000-0000-000000000001", voucher: CT_VOUCHER, invoice_settlement: "5a000000-0000-0000-0000-000000000001" };
const CT = (id, no, kind, total, items) => asCompany(C1, async () => {
  await db.exec(`insert into combined_transactions(id,company_id,txn_no,txn_date,kind,party_id,total_amount) values ('${id}','${C1}','${no}','2025-09-10','${kind}','b0000000-0000-0000-0000-000000000001',${total})`);
  for (const [type, dir, amt] of items) await db.exec(`insert into combined_transaction_items(company_id,combined_txn_id,item_type,${CT_COL[type]},direction,amount) values ('${C1}','${id}','${type}','${CT_DOC[type]}','${dir}',${amt})`);
});
await CT("c1000000-0000-0000-0000-000000000001", "CT-00001", "combined_receipt", 500000, [["receipt", "in", 300000], ["invoice_settlement", "in", 200000]]).then(() => ok("combined receipt: items add up to the total"), (e) => bad("combined receipt", e));
await expectError("combined receipt whose items do not add up is rejected", () => CT("c1000000-0000-0000-0000-000000000002", "CT-00002", "combined_receipt", 500000, [["receipt", "in", 300000]]), "do not add up");
await CT("c1000000-0000-0000-0000-000000000003", "CT-00003", "contra", 0, [["receipt", "in", 150000], ["voucher", "out", 150000]]).then(() => ok("contra: receivable and payable of one party net to zero"), (e) => bad("contra", e));
await expectError("contra that does not net to zero is rejected", () => CT("c1000000-0000-0000-0000-000000000004", "CT-00004", "contra", 0, [["receipt", "in", 150000], ["voucher", "out", 100000]]), "net to zero");

// ═════════════════════════════════════════════════ Tax management (admin-configurable)
console.log("\nTax management");
const GST = "e1000000-0000-0000-0000-000000000001", WHT = "e1000000-0000-0000-0000-000000000002", STAMP = "e1000000-0000-0000-0000-000000000003", TG = "e2000000-0000-0000-0000-000000000001";
await asCompany(C1, () => db.exec(`
  insert into tax_codes(id,company_id,code,name,kind,direction,applies_on) values
    ('${GST}','${C1}','SALES_TAX','Sales tax on services','sales_tax','output','revenue'),
    ('${WHT}','${C1}','WHT_SALE','Withholding on sale','withholding','withheld_from_us','revenue'),
    ('${STAMP}','${C1}','STAMP','Stamp duty (slab)','stamp_duty','output','transfer');
  insert into tax_rates(company_id,tax_code_id,rate_pct,filer_status,effective_from,effective_to) values
    ('${C1}','${GST}',16,'any','2025-07-01','2026-06-30'),
    ('${C1}','${GST}',18,'any','2026-07-01',null),
    ('${C1}','${WHT}',3,'filer','2025-07-01',null),
    ('${C1}','${WHT}',6,'non_filer','2025-07-01',null);
  insert into tax_rates(company_id,tax_code_id,slabs,filer_status,effective_from) values ('${C1}','${STAMP}','[{"from":0,"to":1000000,"rate":1},{"from":1000000,"to":null,"rate":2}]'::jsonb,'any','2025-07-01');
  insert into tax_groups(id,company_id,name) values ('${TG}','${C1}','Plot sale taxes');
  insert into tax_group_items(company_id,group_id,tax_code_id,sequence,compound) values ('${C1}','${TG}','${WHT}',1,false),('${C1}','${TG}','${GST}',2,true);
`)).then(() => ok("admin defines tax codes, effective-dated rates, slabs and a bundle"), (e) => bad("tax setup", e));
await expectError("overlapping rate periods for the same tax are rejected", () => asCompany(C1, () => db.exec(`insert into tax_rates(company_id,tax_code_id,rate_pct,filer_status,effective_from) values ('${C1}','${GST}',17,'any','2026-01-01')`)), "overlap");
await expectError("a rate must be a percent, a flat amount or slabs — exactly one", () => asCompany(C1, () => db.exec(`insert into tax_rates(company_id,tax_code_id,rate_pct,flat_amount,filer_status,effective_from) values ('${C1}','${WHT}',1,5,'any','2030-01-01')`)), "check");
const r16 = await asCompany(C1, () => db.query(`select rate_pct from app.tax_rate_on('${GST}','2026-03-01')`));
const r18 = await asCompany(C1, () => db.query(`select rate_pct from app.tax_rate_on('${GST}','2026-08-01')`));
Number(r16.rows[0].rate_pct) === 16 && Number(r18.rows[0].rate_pct) === 18 ? ok("rate in force depends on the date (16% -> 18% from 1 Jul 2026)") : bad("rate lookup", [r16.rows, r18.rows]);
const f = await asCompany(C1, () => db.query(`select rate_pct from app.tax_rate_on('${WHT}','2026-01-01','filer')`));
const nf = await asCompany(C1, () => db.query(`select rate_pct from app.tax_rate_on('${WHT}','2026-01-01','non_filer')`));
Number(f.rows[0].rate_pct) === 3 && Number(nf.rows[0].rate_pct) === 6 ? ok("rate depends on filer status (3% vs 6%)") : bad("filer rate", [f.rows, nf.rows]);
const grp = await asCompany(C1, () => db.query(`select tax_code_id, rate_pct, base_amount, tax_amount from app.apply_tax_group('${TG}', 10000000, '2026-03-01', 'non_filer')`));
// WHT 6% of 10,000,000 = 600,000; compound sales tax 16% on (10,000,000 + 600,000) = 1,696,000
Number(grp.rows[0].tax_amount) === 600000 && Number(grp.rows[1].tax_amount) === 1696000 && Number(grp.rows[1].base_amount) === 10600000
  ? ok("tax bundle: ordered, compound (600,000 then 1,696,000 on 10,600,000)") : bad("tax group", grp.rows);
const stamp = await asCompany(C1, () => db.query(`select tax_amount from app.apply_tax_group((select 'e2000000-0000-0000-0000-000000000009'::uuid), 1, current_date)`));
stamp.rows.length === 0 ? ok("unknown/empty bundle yields no tax") : bad("empty bundle", stamp.rows);
await asCompany(C1, () => db.exec(`insert into tax_groups(id,company_id,name) values ('e2000000-0000-0000-0000-000000000002','${C1}','Transfer duty');
  insert into tax_group_items(company_id,group_id,tax_code_id,sequence) values ('${C1}','e2000000-0000-0000-0000-000000000002','${STAMP}',1)`));
const slab = await asCompany(C1, () => db.query(`select tax_amount from app.apply_tax_group('e2000000-0000-0000-0000-000000000002', 2500000, '2026-03-01')`));
Number(slab.rows[0].tax_amount) === 40000 ? ok("progressive slabs (1% of first 1M + 2% of next 1.5M = 40,000)") : bad("slabs", slab.rows);
await asCompany(C1, () => db.exec(`insert into tax_assignments(company_id,name,doc_type,tax_group_id,conditions,priority) values ('${C1}','Plots to non-filers','booking','${TG}','{"filer_status":"non_filer"}',10);
  insert into document_taxes(company_id,doc_type,booking_id,tax_code_id,base_amount,rate_pct,tax_amount,direction) values ('${C1}','booking','${B2}','${WHT}',10000000,6,600000,'withheld_from_us')`)).then(() => ok("assignment rule + per-document tax record"), (e) => bad("assignment/doc tax", e));

// ═════════════════════════════════════════════════ Inter-company transactions & consolidation
console.log("\nInter-company & consolidation");
const ORG = "00000000-0000-0000-0000-0000000000a1", CGRP = "99000000-0000-0000-0000-000000000001";
const A = { cash: "a0000000-0000-0000-0000-0000000000c1", from: "a0000000-0000-0000-0000-0000000000c2", to: "a0000000-0000-0000-0000-0000000000c3" };
const asOrg = async (company, fn) => {
  await db.exec("begin");
  try { await db.exec(`set local role app_user; select set_config('app.company_id','${company}',true), set_config('app.org_id','${ORG}',true)`); const r = await fn(); await db.exec("commit"); return r; }
  catch (e) { await db.exec("rollback"); throw e; }
};
// company 2 needs a calendar + accounts too (company 1 already has them)
await asOrg(C2, () => db.exec(`
  insert into fiscal_years(id,company_id,name,start_date,end_date) values ('f0000000-0000-0000-0000-0000000000f2','${C2}','FY2026','2025-07-01','2026-06-30');
  insert into accounting_periods(id,company_id,fiscal_year_id,start_date,end_date) values ('e0000000-0000-0000-0000-0000000000e2','${C2}','f0000000-0000-0000-0000-0000000000f2','2025-08-01','2025-08-31');
  insert into gl_accounts(id,company_id,code,name,account_class,category) values
    ('${A.cash}','${C2}','01010001','Bank','asset','asset_bank'),
    ('${A.to}','${C2}','02010001','Due to Co One','liability','liability_intercompany');
`));
await asOrg(C1, () => db.exec(`
  insert into gl_accounts(id,company_id,code,name,account_class,category) values ('${A.from}','${C1}','03010009','Due from Co Two','asset','asset_intercompany');
  insert into intercompany_accounts(company_id,counterparty_company_id,due_from_account_id,due_to_account_id) values ('${C1}','${C2}','${A.from}','${CASH}');
`));
await asOrg(C2, () => db.exec(`insert into intercompany_accounts(company_id,counterparty_company_id,due_from_account_id,due_to_account_id) values ('${C2}','${C1}','${A.cash}','${A.to}')`));
const ICT = "ac000000-0000-0000-0000-000000000001";
await asOrg(C1, () => db.exec(`insert into intercompany_transactions(id,org_id,txn_no,from_company_id,to_company_id,kind,txn_date,amount,description) values ('${ICT}','${ORG}','ICT-00001','${C1}','${C2}','loan','2025-08-15',1000000,'Working-capital loan')`));
const sees = async (company) => (await asOrg(company, () => db.query(`select count(*)::int n from intercompany_transactions`))).rows[0].n;
await db.exec(`insert into companies(id,org_id,name) values ('00000000-0000-0000-0000-0000000000c3','${ORG}','Co Three')`);
(await sees(C1)) === 1 && (await sees(C2)) === 1 && (await sees("00000000-0000-0000-0000-0000000000c3")) === 0
  ? ok("inter-company transaction visible to both parties, hidden from a third company") : bad("intercompany visibility", [await sees(C1), await sees(C2)]);
await expectError("a third company cannot post someone else's transaction", () => asOrg("00000000-0000-0000-0000-0000000000c3", () => db.exec(`select app.post_intercompany('${ICT}','${A.cash}','${A.cash}')`)), "not a party");
// sender: bank = CASH (company 1's cash account); receiver bank = A.cash
await asOrg(C1, () => db.exec(`select app.post_intercompany('${ICT}','${BANK}','${A.cash}')`)).then(() => ok("one call posts BOTH sides atomically"), (e) => bad("post_intercompany", e));
const t = await asOrg(C1, () => db.query(`select status, from_entry_id is not null f, to_entry_id is not null t from intercompany_transactions where id='${ICT}'`));
t.rows[0].status === "posted" && t.rows[0].f && t.rows[0].t ? ok("transaction marked posted with both journal entries linked") : bad("posted state", t.rows);
const own1 = await asOrg(C1, () => db.query(`select count(*)::int n from journal_entries where source_id='${ICT}'`));
const own2 = await asOrg(C2, () => db.query(`select count(*)::int n from journal_entries where source_id='${ICT}'`));
own1.rows[0].n === 1 && own2.rows[0].n === 1 ? ok("each company sees only its own side in its own ledger") : bad("ledger sides", [own1.rows, own2.rows]);
await expectError("an already posted transaction cannot be posted again", () => asOrg(C1, () => db.exec(`select app.post_intercompany('${ICT}','${BANK}','${A.cash}')`)), "draft");

// Group chart + mapping + consolidation with elimination
await asOrg(C1, async () => {
  await db.exec(`insert into consolidation_groups(id,org_id,name) values ('${CGRP}','${ORG}','Whole group');
    insert into consolidation_members(group_id,company_id) values ('${CGRP}','${C1}'),('${CGRP}','${C2}');
    insert into group_accounts(id,org_id,code,name,account_class) values
      ('9a000000-0000-0000-0000-000000000001','${ORG}','G-CASH','Cash & bank','asset'),
      ('9a000000-0000-0000-0000-000000000002','${ORG}','G-ICR','Inter-company receivable','asset'),
      ('9a000000-0000-0000-0000-000000000003','${ORG}','G-ICP','Inter-company payable','liability');
    insert into group_account_map(company_id,gl_account_id,group_account_id) values
      ('${C1}','${BANK}','9a000000-0000-0000-0000-000000000001'),
      ('${C2}','${A.cash}','9a000000-0000-0000-0000-000000000001'),
      ('${C1}','${A.from}','9a000000-0000-0000-0000-000000000002'),
      ('${C2}','${A.to}','9a000000-0000-0000-0000-000000000003')`);
});
const run = await asOrg(C1, async () => (await db.query(`select app.run_consolidation('${CGRP}','2025-08-01','2025-08-31') id`)).rows[0].id);
const cb = await asOrg(C1, () => db.query(`select a.code, cb.debit_total - cb.credit_total net from consolidated_balances cb join group_accounts a on a.id=cb.group_account_id where cb.run_id='${run}' order by a.code`));
const net = Object.fromEntries(cb.rows.map((r) => [r.code, Number(r.net)]));
net["G-CASH"] === 0 && net["G-ICR"] === 0 && net["G-ICP"] === 0
  ? ok("consolidated: cash moved inside the group nets to 0; inter-company receivable/payable eliminated to 0")
  : bad("consolidation netting", net);
const el = await asOrg(C1, () => db.query(`select count(*)::int n from elimination_entries where run_id='${run}'`));
el.rows[0].n === 1 ? ok("elimination entry recorded for the inter-company loan") : bad("elimination", el.rows);
const outsider = await asOrg(C2, () => db.query(`select count(*)::int n from consolidation_groups`)).catch(() => ({ rows: [{ n: -1 }] }));
outsider.rows[0].n === 1 ? ok("group admins of the organization see the consolidation") : bad("org visibility", outsider.rows);
await db.exec("begin; set local role app_user; select set_config('app.org_id','99999999-0000-0000-0000-000000000000',true);");
const otherOrg = await db.query(`select count(*)::int n from consolidation_groups`); await db.exec("rollback");
otherOrg.rows[0].n === 0 ? ok("another organization sees no consolidation data") : bad("org isolation", otherOrg.rows);

// ═════════════════════════════════════════════════ Budgeting & control
console.log("\nBudgeting & control");
{ // own scope: the budget section reuses short variable names
const U1 = "b1000000-0000-0000-0000-000000000001", U2 = "b1000000-0000-0000-0000-000000000002";
const PRJ = "c0000000-0000-0000-0000-000000000001";
const EXP_CIVIL = "ea000000-0000-0000-0000-000000000001", EXP_MKT = "ea000000-0000-0000-0000-000000000002";
const BUD = "bd000000-0000-0000-0000-000000000001";
const L_CIVIL = "b2000000-0000-0000-0000-000000000001", L_MKT = "b2000000-0000-0000-0000-000000000002";
await db.exec(`insert into users(id,email,full_name) values ('${U1}','maker@x.pk','Maker'),('${U2}','checker@x.pk','Checker')`);
// a company that wants a second pair of eyes turns self-approval off (the default allows it, so a one-person company is never locked out)
await db.exec(`update companies set settings = settings || '{"budget_self_approval": false}'::jsonb where id = '${C1}'`);
await asCompany(C1, () => db.exec(`
  insert into gl_accounts(id,company_id,code,name,account_class,category) values
    ('${EXP_CIVIL}','${C1}','05010001','Civil works','expense','expense_construction'),
    ('${EXP_MKT}','${C1}','05020001','Marketing','expense','expense_marketing');
  insert into budgets(id,company_id,budget_no,name,kind,project_id,period_start,period_end,control_mode,created_by)
    values ('${BUD}','${C1}','BUD-00001','Green Valley — project budget','project','${PRJ}','2025-07-01','2026-06-30','warn','${U1}');
  insert into budget_lines(id,company_id,budget_id,line_no,category,account_id,budget_amount) values
    ('${L_CIVIL}','${C1}','${BUD}',1,'Civil & structural','${EXP_CIVIL}',1000000),
    ('${L_MKT}','${C1}','${BUD}',2,'Marketing & sales','${EXP_MKT}',200000);
`)).then(() => ok("draft budget with two lines"), (e) => bad("budget setup", e));
const tot = await asCompany(C1, () => db.query(`select total_amount from budgets where id='${BUD}'`));
Number(tot.rows[0].total_amount) === 1200000 ? ok("budget total rolls up from its lines (1,200,000)") : bad("rollup", tot.rows);
await expectError("a second live budget for the same project is rejected", () => asCompany(C1, () => db.exec(`insert into budgets(company_id,budget_no,name,kind,project_id,created_by) values ('${C1}','BUD-00002','Dup','project','${PRJ}','${U1}')`)), "budgets_one_live_per_project");
await expectError("a project budget must name its project", () => asCompany(C1, () => db.exec(`insert into budgets(company_id,budget_no,name,kind) values ('${C1}','BUD-00003','No project','project')`)), "check");

// phasing: the months must add up to the line (deferred, checked at commit)
await asCompany(C1, () => db.exec(`insert into budget_line_periods(company_id,budget_line_id,period_id,amount) values
  ('${C1}','${L_MKT}','${P1}',80000),('${C1}','${L_MKT}','${P2}',120000)`)).then(() => ok("monthly phasing that adds up to the line is accepted"), (e) => bad("phasing ok", e));
await expectError("phasing that does not add up to the line is rejected", () => asCompany(C1, () => db.exec(`update budget_line_periods set amount = 90000 where budget_line_id='${L_MKT}' and period_id='${P1}'`)), "must add up");

// status machine + maker-checker
await expectError("a draft cannot jump straight to approved", () => asCompany(C1, () => db.exec(`update budgets set status='approved' where id='${BUD}'`)), "cannot go from");
await asCompany(C1, () => db.exec(`update budgets set status='submitted' where id='${BUD}'`)).then(() => ok("draft -> submitted"), (e) => bad("submit", e));
await expectError("the creator cannot approve their own budget", () => asCompany(C1, () => db.exec(`select app.approve_budget('${BUD}','${U1}')`)), "Maker-checker");
await asCompany(C1, () => db.exec(`select app.approve_budget('${BUD}','${U2}')`)).then(() => ok("a different user approves it"), (e) => bad("approve", e));
const snap = await asCompany(C1, () => db.query(`select version_no from budget_snapshots where budget_id='${BUD}'`));
snap.rows.length === 1 && snap.rows[0].version_no === 1 ? ok("approval stores a v1 snapshot") : bad("snapshot v1", snap.rows);
await expectError("approved lines cannot be edited directly", () => asCompany(C1, () => db.exec(`update budget_lines set budget_amount = 5000000 where id='${L_CIVIL}'`)), "approved revision");
await expectError("lines cannot be added to an approved budget", () => asCompany(C1, () => db.exec(`insert into budget_lines(company_id,budget_id,line_no,category,account_id,budget_amount) values ('${C1}','${BUD}',3,'Extra','${EXP_CIVIL}',1)`)), "approved revision");

// actual comes from the ledger
const post = (id, no, project, account, amount) => asCompany(C1, () => db.exec(`
  insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type) values ('${id}','${C1}','${no}','2025-08-12','${P2}','voucher');
  insert into journal_lines(company_id,entry_id,line_no,account_id,project_id,debit,credit) values ('${C1}','${id}',1,'${account}',${project ? "'" + project + "'" : "null"},${amount},0);
  insert into journal_lines(company_id,entry_id,line_no,account_id,debit,credit) values ('${C1}','${id}',2,'${CASH}',0,${amount})`));
await post("e3000000-0000-0000-0000-000000000001", "JV-00101", PRJ, EXP_CIVIL, 300000);
await post("e3000000-0000-0000-0000-000000000002", "JV-00102", null, EXP_CIVIL, 999999);   // another project / no project: must not count
const st = (line) => asCompany(C1, async () => (await db.query(`select budget_amount, committed_amount, actual_amount, available_amount, utilization_pct from v_budget_line_status where budget_line_id='${line}'`)).rows[0]);
let v = await st(L_CIVIL);
Number(v.actual_amount) === 300000 && Number(v.available_amount) === 700000 && Number(v.utilization_pct) === 30
  ? ok("actual is read from the ledger for this project only (300,000 = 30%)") : bad("actual from ledger", v);

// commitments reduce what is available
await asCompany(C1, () => db.exec(`insert into budget_commitments(id,company_id,budget_line_id,source_type,source_id,amount,committed_on) values ('c4000000-0000-0000-0000-000000000001','${C1}','${L_CIVIL}','purchase_order','a4000000-0000-0000-0000-000000000001',400000,'2025-08-15')`));
v = await st(L_CIVIL);
Number(v.committed_amount) === 400000 && Number(v.available_amount) === 300000 ? ok("an open purchase order is committed (available drops to 300,000)") : bad("commitment", v);
await asCompany(C1, () => db.exec(`update budget_commitments set status='invoiced' where id='c4000000-0000-0000-0000-000000000001'`));
v = await st(L_CIVIL);
Number(v.committed_amount) === 0 ? ok("once invoiced it stops counting as a commitment") : bad("commitment released", v);
await asCompany(C1, () => db.exec(`update budget_commitments set status='open' where id='c4000000-0000-0000-0000-000000000001'`));

// spend control
const chk = (amount) => asCompany(C1, async () => (await db.query(`select * from app.check_budget('${EXP_CIVIL}','${PRJ}',null,'2025-09-01',${amount})`)).rows[0]);
(await chk(200000)).decision === "allow" ? ok("within budget -> allow") : bad("allow", await chk(200000));
const w = await chk(500000);
w.decision === "warn" && Number(w.over_by) === 200000 ? ok("over budget with control = Warn -> warn (over by 200,000)") : bad("warn", w);
await asCompany(C1, () => db.exec(`update budgets set control_mode='block' where id='${BUD}'`));
(await chk(500000)).decision === "block" ? ok("over budget with control = Block -> block") : bad("block", await chk(500000));
const none = await asCompany(C1, async () => (await db.query(`select * from app.check_budget('${CASH}','${PRJ}',null,'2025-09-01',1)`)).rows.length);
none === 0 ? ok("no budget covers the account -> nothing to enforce") : bad("no budget", none);
const outside = await asCompany(C1, async () => (await db.query(`select * from app.check_budget('${EXP_CIVIL}','${PRJ}',null,'2027-01-01',1)`)).rows.length);
outside === 0 ? ok("a date outside the budget period is not covered") : bad("period", outside);
await asCompany(C1, () => db.exec(`insert into budget_exceptions(company_id,budget_line_id,doc_type,requested_amount,over_by,reason,requested_by) values ('${C1}','${L_CIVIL}','vendor_bill',500000,200000,'Urgent culvert repair','${U1}')`)).then(() => ok("a blocked user can request an exception"), (e) => bad("exception", e));
await expectError("you cannot approve your own exception", () => asCompany(C1, () => db.exec(`update budget_exceptions set status='approved', decided_by='${U1}', decided_at=now() where budget_line_id='${L_CIVIL}'`)), "check");

// alerts
await asCompany(C1, () => db.exec(`insert into budget_alert_rules(company_id,threshold_pct) values ('${C1}',85),('${C1}',100)`));
const ev = (b) => asCompany(C1, async () => (await db.query(`select app.evaluate_budget_alerts('${b}') n`)).rows[0].n);
(await ev(BUD)) === 0 ? ok("70% used -> no alert yet") : bad("no alert", null);
await asCompany(C1, () => db.exec(`insert into budget_commitments(company_id,budget_line_id,source_type,amount,committed_on) values ('${C1}','${L_CIVIL}','manual',200000,'2025-08-20')`));
(await ev(BUD)) === 1 ? ok("crossing 85% fires one alert") : bad("85 alert", null);
(await ev(BUD)) === 0 ? ok("re-running does not duplicate it") : bad("dup alert", null);
await asCompany(C1, () => db.exec(`insert into budget_commitments(company_id,budget_line_id,source_type,amount,committed_on) values ('${C1}','${L_CIVIL}','manual',150000,'2025-08-21')`));
(await ev(BUD)) === 1 ? ok("going over 100% fires the next alert") : bad("100 alert", null);

// revisions: the only way to change an approved budget
const REV1 = "d5000000-0000-0000-0000-000000000001", REV2 = "d5000000-0000-0000-0000-000000000002", REV3 = "d5000000-0000-0000-0000-000000000003";
await asCompany(C1, () => db.exec(`
  insert into budget_revisions(id,company_id,budget_id,revision_no,type,reason,requested_by) values ('${REV1}','${C1}','${BUD}',2,'reallocation','Move to marketing','${U1}');
  insert into budget_revision_lines(company_id,revision_id,budget_line_id,delta_amount) values ('${C1}','${REV1}','${L_CIVIL}',-100000),('${C1}','${REV1}','${L_MKT}',100000);`));
await expectError("requester cannot approve their own revision", () => asCompany(C1, () => db.exec(`select app.approve_budget_revision('${REV1}','${U1}')`)), "Maker-checker");
await asCompany(C1, () => db.exec(`select app.approve_budget_revision('${REV1}','${U2}')`)).then(() => ok("an approved reallocation moves money between lines"), (e) => bad("reallocation", e));
const after = await asCompany(C1, () => db.query(`select (select budget_amount from budget_lines where id='${L_CIVIL}') c, (select budget_amount from budget_lines where id='${L_MKT}') m, (select total_amount from budgets where id='${BUD}') t, (select version_no from budgets where id='${BUD}') v, (select count(*)::int from budget_snapshots where budget_id='${BUD}') snaps`));
Number(after.rows[0].c) === 900000 && Number(after.rows[0].m) === 300000 && Number(after.rows[0].t) === 1200000 && after.rows[0].v === 2 && after.rows[0].snaps === 2
  ? ok("lines 900k / 300k, total unchanged, version 2, second snapshot stored") : bad("after reallocation", after.rows);
const ph = await asCompany(C1, () => db.query(`select sum(amount) s from budget_line_periods where budget_line_id='${L_MKT}'`));
Number(ph.rows[0].s) === 300000 ? ok("monthly phasing was rescaled to the new line amount (300,000)") : bad("phasing rescale", ph.rows);
await asCompany(C1, () => db.exec(`
  insert into budget_revisions(id,company_id,budget_id,revision_no,type,reason,requested_by) values ('${REV2}','${C1}','${BUD}',3,'reallocation','Unbalanced','${U1}');
  insert into budget_revision_lines(company_id,revision_id,budget_line_id,delta_amount) values ('${C1}','${REV2}','${L_CIVIL}',-50000),('${C1}','${REV2}','${L_MKT}',20000);`));
await expectError("a reallocation that does not net to zero is rejected", () => asCompany(C1, () => db.exec(`select app.approve_budget_revision('${REV2}','${U2}')`)), "net to zero");
await asCompany(C1, () => db.exec(`
  insert into budget_revisions(id,company_id,budget_id,revision_no,type,reason,requested_by) values ('${REV3}','${C1}','${BUD}',4,'supplementary','Scope addition','${U1}');
  insert into budget_revision_lines(company_id,revision_id,budget_line_id,delta_amount) values ('${C1}','${REV3}','${L_CIVIL}',250000);
  select app.approve_budget_revision('${REV3}','${U2}')`));
const sup = await asCompany(C1, () => db.query(`select total_amount from budgets where id='${BUD}'`));
Number(sup.rows[0].total_amount) === 1450000 ? ok("a supplementary revision raises the total (1,450,000)") : bad("supplementary", sup.rows);
await expectError("editing lines directly is still blocked after revisions", () => asCompany(C1, () => db.exec(`update budget_lines set budget_amount = 1 where id='${L_CIVIL}'`)), "approved revision");

// tenant isolation
const other = await asCompany(C2, () => db.query(`select (select count(*)::int from budgets) b, (select count(*)::int from budget_lines) l, (select count(*)::int from v_budget_line_status) v`));
other.rows[0].b === 0 && other.rows[0].l === 0 && other.rows[0].v === 0 ? ok("another company sees no budgets, lines or status rows") : bad("budget isolation", other.rows);

}

// ═════════════════════════════════════════════════ Voiding a receipt (D1.1)
console.log("\nVoiding a receipt");
{
  const U = "b1000000-0000-0000-0000-0000000000f1";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','cashier@x.pk','Cashier')`);
  const JE = "e1000000-0000-0000-0000-000000000001", RV = "2c000000-0000-0000-0000-000000000001", IV = "1a000000-0000-0000-0000-000000000009";
  await entry(JE, "JV-V0001", P2, [[CASH, 200000, 0], [SALES, 0, 200000]]);
  await asCompany(C1, () => db.exec(`
    insert into installments(id,company_id,booking_id,seq,due_date,amount) values ('${IV}','${C1}','${B2}',9,'2025-12-01',200000);
    insert into receipts(id,company_id,receipt_no,customer_id,booking_id,received_on,amount,method,deposit_account,journal_entry_id)
      values ('${RV}','${C1}','RCT-00010','b0000000-0000-0000-0000-000000000001','${B2}','2025-08-10',200000,'cash','${CASH}','${JE}');
    insert into receipt_allocations(company_id,receipt_id,installment_id,amount) values ('${C1}','${RV}','${IV}',200000)`));
  const st = (sql) => asCompany(C1, () => db.query(sql));
  (await st(`select status from installments where id='${IV}'`)).rows[0].status === "paid" ? ok("receipt allocation pays the installment") : bad("setup paid");

  await expectError("an allocation cannot be edited", () => asCompany(C1, () => db.exec(`update receipt_allocations set amount = 1 where receipt_id='${RV}'`)), "append-only");
  await expectError("an allocation cannot be deleted", () => asCompany(C1, () => db.exec(`delete from receipt_allocations where receipt_id='${RV}'`)), "append-only");
  await expectError("a posted receipt's amount cannot be changed", () => asCompany(C1, () => db.exec(`update receipts set amount = 1 where id='${RV}'`)), "cannot change amount");
  await expectError("flipping a receipt to void by hand is blocked while it still has allocations", () => asCompany(C1, () => db.exec(`update receipts set status='void' where id='${RV}'`)), "app.void_receipt");
  await expectError("voiding needs a reason", () => asCompany(C1, () => db.exec(`select app.void_receipt('${RV}','${U}','  ','2025-08-20')`)), "reason is required");

  await asCompany(C1, () => db.exec(`select app.void_receipt('${RV}','${U}','Cheque bounced','2025-08-20')`)).then(() => ok("void_receipt runs"), (e) => bad("void_receipt", e));
  const inst2 = (await st(`select status, paid_amount from installments where id='${IV}'`)).rows[0];
  inst2.status === "due" && Number(inst2.paid_amount) === 0 ? ok("voiding returns the installment to due / 0 paid") : bad("installment after void", inst2);
  const rc = (await st(`select status, void_reason, voided_at is not null as stamped from receipts where id='${RV}'`)).rows[0];
  rc.status === "void" && rc.void_reason === "Cheque bounced" && rc.stamped ? ok("receipt is void, with reason and timestamp") : bad("receipt after void", rc);
  const net = (await st(`select coalesce(sum(amount),0) n, count(*)::int c from receipt_allocations where receipt_id='${RV}'`)).rows[0];
  Number(net.n) === 0 && net.c === 2 ? ok("allocations are kept: original + reversal net to zero") : bad("allocations after void", net);

  const je = (await st(`select e.status, (select count(*)::int from journal_entries r where r.reversal_of = e.id) rev,
      (select coalesce(sum(credit),0) from journal_lines l join journal_entries r on r.id=l.entry_id where r.reversal_of = e.id and l.account_id='${CASH}') cash_cr
    from journal_entries e where e.id='${JE}'`)).rows[0];
  je.status === "reversed" && je.rev === 1 && Number(je.cash_cr) === 200000 ? ok("receipt's journal entry is reversed with swapped sides") : bad("journal reversal", je);

  await expectError("a receipt cannot be voided twice", () => asCompany(C1, () => db.exec(`select app.void_receipt('${RV}','${U}','again','2025-08-20')`)), "already void");
  await expectError("a void receipt takes no new allocations", () => asCompany(C1, () => db.exec(`insert into receipt_allocations(company_id,receipt_id,installment_id,amount) values ('${C1}','${RV}','${IV}',1000)`)), "void");
  await expectError("a void receipt cannot be edited", () => asCompany(C1, () => db.exec(`update receipts set instrument_ref='x' where id='${RV}'`)), "void receipt");
  await expectError("a reversal cannot itself be reversed", () => asCompany(C1, () => db.exec(`select app.reverse_entry((select id from journal_entries where reversal_of='${JE}'),'2025-08-21','x')`)), "cannot itself be reversed");
  await expectError("an already-reversed entry cannot be reversed again", () => asCompany(C1, () => db.exec(`select app.reverse_entry('${JE}','2025-08-21','x')`)), "already reversed");
}

// ═════════════════════════════════════════════════ Holds, property status, safe booking (D1.3)
console.log("\nHolds, status & safe booking");
{
  const U = "b1000000-0000-0000-0000-0000000000f2";
  const CUST_A = "b0000000-0000-0000-0000-000000000001", CUST_B = "b0000000-0000-0000-0000-0000000000b2";
  const PRJ = "c0000000-0000-0000-0000-000000000001", TYPE = "70000000-0000-0000-0000-000000000001";
  const PA = "d0000000-0000-0000-0000-0000000000a1", PB = "d0000000-0000-0000-0000-0000000000a2", PC = "d0000000-0000-0000-0000-0000000000a3";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','sales@x.pk','Sales Agent')`);
  await asCompany(C1, () => db.exec(`
    insert into parties(id,company_id,display_name) values ('${CUST_B}','${C1}','Bilal Raza');
    insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
      ('${PA}','${C1}','${PRJ}','${TYPE}','PRP-2001','Plot A',5000000),
      ('${PB}','${C1}','${PRJ}','${TYPE}','PRP-2002','Plot B',6000000),
      ('${PC}','${C1}','${PRJ}','${TYPE}','PRP-2003','Plot C',7000000)`));
  const q = (sql) => asCompany(C1, () => db.query(sql));
  const status = async (id) => (await q(`select status from properties where id='${id}'`)).rows[0].status;
  const histCount = async (id) => (await q(`select count(*)::int n from property_status_history where property_id='${id}'`)).rows[0].n;

  // — hold —
  const H1 = await asCompany(C1, async () => (await db.query(`select app.place_hold('${PA}','${CUST_A}','${U}',60) id`)).rows[0].id);
  (await status(PA)) === "reserved" ? ok("placing a hold reserves the property") : bad("status after hold", await status(PA));
  const h = (await q(`select from_status, to_status, reason from property_status_history where property_id='${PA}'`)).rows;
  h.length === 1 && h[0].from_status === "available" && h[0].to_status === "reserved" && h[0].reason === "Hold placed"
    ? ok("status change is logged with from / to / reason") : bad("status history", h);
  await expectError("a second hold on the same property is rejected", () => asCompany(C1, () => db.exec(`select app.place_hold('${PA}','${CUST_B}','${U}')`)), "not available");
  await expectError("another customer cannot book a held property", () => asCompany(C1, () => db.exec(`select app.create_booking('${PA}','${CUST_B}','installment','${U}')`)), "on hold for someone else");

  // — booking converts the hold —
  const BK = await asCompany(C1, async () => (await db.query(`select app.create_booking('${PA}','${CUST_A}','cash','${U}',null,100000,'2025-08-12',null,null,'pending','req-1') id`)).rows[0].id);
  const bk = (await q(`select booking_no, net_price, list_price from bookings where id='${BK}'`)).rows[0];
  /^BOOKING-\d{5}$/.test(bk.booking_no) && Number(bk.list_price) === 5000000 && Number(bk.net_price) === 4900000
    ? ok("create_booking numbers the booking and takes the price from the property") : bad("create_booking", bk);
  const hold = (await q(`select release_reason, converted_booking_id from property_holds where id='${H1}'`)).rows[0];
  hold.release_reason === "converted" && hold.converted_booking_id === BK ? ok("the customer's hold is converted into the booking") : bad("hold conversion", hold);
  (await status(PA)) === "reserved" ? ok("property stays reserved while the booking is live") : bad("status with booking", await status(PA));
  const again = await asCompany(C1, async () => (await db.query(`select app.create_booking('${PA}','${CUST_A}','cash','${U}',null,100000,'2025-08-12',null,null,'pending','req-1') id`)).rows[0].id);
  const nbk = (await q(`select count(*)::int n from bookings where property_id='${PA}' and idempotency_key='req-1'`)).rows[0].n;
  again === BK && nbk === 1 ? ok("retrying with the same key returns the same booking, not a second one") : bad("idempotency", { again, BK, nbk });
  await expectError("a second live booking on a reserved property is rejected", () => asCompany(C1, () => db.exec(`select app.create_booking('${PA}','${CUST_B}','cash','${U}')`)), "bookings_one_live_per_property");

  // — status follows the booking —
  await asCompany(C1, () => db.exec(`update bookings set status='confirmed' where id='${BK}'`));
  (await status(PA)) === "reserved" ? ok("confirmed booking: still reserved") : bad("confirmed", await status(PA));
  await asCompany(C1, () => db.exec(`update bookings set status='completed' where id='${BK}'`));
  (await status(PA)) === "sold" ? ok("completed booking marks the property sold") : bad("sold", await status(PA));
  await asCompany(C1, () => db.exec(`update bookings set status='cancelled', cancelled_at=now(), cancel_reason='test' where id='${BK}'`));
  (await status(PA)) === "available" ? ok("cancelling the booking frees the property") : bad("freed", await status(PA));
  (await histCount(PA)) === 3 ? ok("every transition is in the history (available > reserved > sold > available)") : bad("history count", await histCount(PA));

  // — manual edits that contradict the facts —
  await expectError("cannot mark a property sold by hand", () => asCompany(C1, () => db.exec(`update properties set status='sold' where id='${PB}'`)), "completed booking");
  await expectError("cannot mark a property reserved by hand", () => asCompany(C1, () => db.exec(`update properties set status='reserved' where id='${PB}'`)), "hold or a booking");
  const HB = await asCompany(C1, async () => (await db.query(`select app.place_hold('${PB}',null,'${U}',60) id`)).rows[0].id);
  await expectError("cannot free or block a property that has a live hold", () => asCompany(C1, () => db.exec(`update properties set status='blocked' where id='${PB}'`)), "live booking or hold");
  await expectError("cannot edit the status history", () => asCompany(C1, () => db.exec(`update property_status_history set reason='x'`)), "append-only");

  // staff-only hold (no customer) belongs to the staff member who placed it
  await expectError("a staff hold blocks other staff", () => asCompany(C1, () => db.exec(`select app.create_booking('${PB}','${CUST_B}','cash','b1000000-0000-0000-0000-000000000001')`)), "on hold for someone else");
  await asCompany(C1, () => db.exec(`select app.release_hold('${HB}')`));
  (await status(PB)) === "available" ? ok("releasing a hold frees the property") : bad("release", await status(PB));

  // — expiry —
  await asCompany(C1, () => db.exec(`insert into property_holds(company_id,property_id,held_for_party_id,held_by,held_at,expires_at)
    values ('${C1}','${PC}','${CUST_A}','${U}', now() - interval '2 hours', now() - interval '1 hour')`));
  (await status(PC)) === "available" ? ok("an already-expired hold does not reserve the property") : bad("expired hold status", await status(PC));
  const swept = await asCompany(C1, async () => (await db.query(`select app.expire_holds() n`)).rows[0].n);
  const exp = (await q(`select release_reason from property_holds where property_id='${PC}'`)).rows[0];
  swept === 1 && exp.release_reason === "expired" ? ok("expire_holds() releases expired holds") : bad("expire_holds", { swept, exp });
  await asCompany(C1, () => db.exec(`insert into property_holds(company_id,property_id,held_for_party_id,held_by,held_at,expires_at)
    values ('${C1}','${PC}','${CUST_A}','${U}', now() - interval '2 hours', now() - interval '1 hour')`));
  await asCompany(C1, () => db.exec(`select app.place_hold('${PC}','${CUST_B}','${U}',30)`)).then(() => ok("a new hold takes over from a stale expired one"), (e) => bad("takeover", e));

  // — blocked properties and tenant isolation —
  await asCompany(C1, () => db.exec(`select app.release_hold((select id from property_holds where property_id='${PC}' and released_at is null))`));
  await asCompany(C1, () => db.exec(`update properties set status='blocked' where id='${PC}'`));
  await expectError("a blocked property cannot be held", () => asCompany(C1, () => db.exec(`select app.place_hold('${PC}','${CUST_A}','${U}')`)), "not available");
  await expectError("a blocked property cannot be booked", () => asCompany(C1, () => db.exec(`select app.create_booking('${PC}','${CUST_A}','cash','${U}')`)), "not available");
  const iso = await asCompany(C2, () => db.query(`select (select count(*)::int from property_holds) h, (select count(*)::int from property_status_history) s`));
  iso.rows[0].h === 0 && iso.rows[0].s === 0 ? ok("another company sees no holds or status history") : bad("hold isolation", iso.rows);
  await expectError("another company cannot hold or book this company's property", () => asCompany(C2, () => db.exec(`select app.place_hold('${PA}',null,null)`)), "not found");
}

// ═════════════════════════════════════════════════ Cross-tenant references (D1.2)
console.log("\nCross-tenant references");
{
  // Company 2 tries to point its rows at company 1's records, as the app role, with RLS on.
  const C1_BOOKING = "ba000000-0000-0000-0000-000000000002", C1_PARTY = "b0000000-0000-0000-0000-000000000001";
  const C1_PROJECT = "c0000000-0000-0000-0000-000000000001", C1_CASH = "a0000000-0000-0000-0000-000000000002";
  const C1_PERIOD = "e0000000-0000-0000-0000-000000000002", C1_TYPE = "70000000-0000-0000-0000-000000000001";
  const C2_PARTY = "b0000000-0000-0000-0000-0000000000c2", C2_PROJECT = "c0000000-0000-0000-0000-0000000000c2";
  const C2_TYPE = "70000000-0000-0000-0000-0000000000c2", C2_PROP = "d0000000-0000-0000-0000-0000000000c2";
  await asCompany(C2, () => db.exec(`
    insert into parties(id,company_id,display_name) values ('${C2_PARTY}','${C2}','Company Two Customer');
    insert into projects(id,company_id,code,name,type) values ('${C2_PROJECT}','${C2}','PRJ-C2','Two Valley','residential');
    insert into property_types(id,company_id,code,name,property_group) values ('${C2_TYPE}','${C2}','plot','Plot','residential');
    insert into properties(id,company_id,project_id,type_id,code,title,list_price) values ('${C2_PROP}','${C2}','${C2_PROJECT}','${C2_TYPE}','PRP-1000','C2 Plot',1000000)`))
    .then(() => ok("company 2 can build its own consistent chain (same codes as company 1 are fine)"), (e) => bad("company 2 own chain", e));

  await expectError("company 2 cannot create an installment on company 1's booking", () => asCompany(C2, () => db.exec(
    `insert into installments(company_id,booking_id,seq,due_date,amount) values ('${C2}','${C1_BOOKING}',99,'2025-09-01',1000)`)), "installments_booking_id_tenant_fk");
  await expectError("company 2 cannot issue a receipt to company 1's customer", () => asCompany(C2, () => db.exec(
    `insert into receipts(company_id,receipt_no,customer_id,received_on,amount,method,deposit_account)
       values ('${C2}','RCT-X1','${C1_PARTY}','2025-09-01',1000,'cash','${C1_CASH}')`)), "tenant_fk");
  await expectError("company 2 cannot put its property in company 1's project", () => asCompany(C2, () => db.exec(
    `insert into properties(company_id,project_id,type_id,code,title,list_price) values ('${C2}','${C1_PROJECT}','${C2_TYPE}','PRP-X1','Stolen',1)`)), "properties_project_id_tenant_fk");
  await expectError("company 2 cannot use company 1's property type", () => asCompany(C2, () => db.exec(
    `insert into properties(company_id,project_id,type_id,code,title,list_price) values ('${C2}','${C2_PROJECT}','${C1_TYPE}','PRP-X2','Wrong type',1)`)), "properties_type_id_tenant_fk");
  await expectError("company 2 cannot post a journal line to company 1's account", () => asCompany(C2, async () => {
    await db.exec(`insert into fiscal_years(id,company_id,name,start_date,end_date) values ('f0000000-0000-0000-0000-0000000000c2','${C2}','FY-XT','2030-07-01','2031-06-30');
      insert into accounting_periods(id,company_id,fiscal_year_id,start_date,end_date) values ('e0000000-0000-0000-0000-0000000000c2','${C2}','f0000000-0000-0000-0000-0000000000c2','2030-08-01','2030-08-31');
      insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type) values ('e1000000-0000-0000-0000-0000000000c2','${C2}','JV-C2','2030-08-10','e0000000-0000-0000-0000-0000000000c2','voucher');
      insert into journal_lines(company_id,entry_id,line_no,account_id,debit,credit) values ('${C2}','e1000000-0000-0000-0000-0000000000c2',1,'${C1_CASH}',10,0)`);
  }), "journal_lines_account_id_tenant_fk");
  await expectError("company 2 cannot book into company 1's accounting period", () => asCompany(C2, () => db.exec(
    `insert into journal_entries(company_id,entry_no,entry_date,period_id,source_type) values ('${C2}','JV-C2B','2025-08-10','${C1_PERIOD}','voucher')`)), "Accounting period");

  // the lint view: nothing in the core chain may still be single-column-only
  const chain = ["bookings","installments","penalty_charges","receipts","receipt_tenders","receipt_allocations","sales_invoices","service_invoices",
    "accounting_periods","journal_entries","journal_lines","project_blocks","properties","property_holds","property_status_history","vouchers","voucher_lines"];
  const gaps = await db.query(`select child_table, child_column from v_tenant_fk_gaps`);
  const core = gaps.rows.filter((g) => chain.includes(g.child_table));
  core.length === 0 ? ok(`lint view: all ${chain.length} core-chain tables are tenant-safe`) : bad("core chain has single-column references", JSON.stringify(core));
  console.log(`  INFO ${gaps.rows.length} single-column tenant references remain outside the core chain (phase-2 tables) — see v_tenant_fk_gaps`);
}

// ═════════════════════════════════════════════════ State machines (D1.4)
console.log("\nState machines");
{
  const U = "b1000000-0000-0000-0000-0000000000f3";
  const CUST = "b0000000-0000-0000-0000-000000000001";
  const PRJ = "c0000000-0000-0000-0000-000000000001", TYPE = "70000000-0000-0000-0000-000000000001";
  const PD = "d0000000-0000-0000-0000-0000000000d1", PE = "d0000000-0000-0000-0000-0000000000d2";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','sm@x.pk','State Tester')`);
  await asCompany(C1, () => db.exec(`insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
    ('${PD}','${C1}','${PRJ}','${TYPE}','PRP-3001','Plot D',4000000), ('${PE}','${C1}','${PRJ}','${TYPE}','PRP-3002','Plot E',4500000)`));
  // run SQL as company 1 with the caller's permissions set, the way the API will
  const run = (perms, sql) => asCompany(C1, async () => {
    if (perms) await db.exec(`select set_config('app.permissions','${perms}', true)`);
    return db.exec(sql);
  });
  const BKD = await asCompany(C1, async () => (await db.query(`select app.create_booking('${PD}','${CUST}','installment','${U}') id`)).rows[0].id);

  // the booking's payment plan: 100,000 down + 3 equal installments = the 4,000,000 price (needed before it can be confirmed)
  const INS = await asCompany(C1, async () => {
    await db.query(`select app.build_schedule('${BKD}', 100000, 3, '2025-10-01')`);
    return (await db.query(`select id from installments where booking_id='${BKD}' and seq = 1`)).rows[0].id;
  });

  // — bookings —
  await expectError("booking: pending cannot jump straight to completed", () => run(null, `update bookings set status='completed' where id='${BKD}'`), 'cannot go from "pending" to "completed"');
  await expectError("booking: confirming needs deals.edit", () => run("accounts.approve", `update bookings set status='confirmed' where id='${BKD}'`), "deals.edit");
  await run("deals.edit", `update bookings set status='confirmed' where id='${BKD}'`).then(() => ok("booking: pending > confirmed with deals.edit"), (e) => bad("confirm", e));
  await expectError("booking: cannot go back to pending", () => run(null, `update bookings set status='pending' where id='${BKD}'`), "cannot go from");
  await expectError("booking: cancelling needs deals.approve, deals.edit is not enough", () => run("deals.edit", `update bookings set status='cancelled' where id='${BKD}'`), "deals.approve");

  // — installments —
  await expectError("installment: waiving needs accounts.approve", () => run("deals.edit", `update installments set status='waived' where id='${INS}'`), "accounts.approve");
  await run("accounts.approve", `update installments set status='waived' where id='${INS}'`).then(() => ok("installment: due > waived with accounts.approve"), (e) => bad("waive", e));
  await expectError("installment: a waived installment cannot be marked paid directly", () => run(null, `update installments set status='paid' where id='${INS}'`), 'cannot go from "waived" to "paid"');
  await run("accounts.approve", `update installments set status='due' where id='${INS}'`).then(() => ok("installment: waiver can be undone"), (e) => bad("unwaive", e));

  // — the system path stays open: receipts move installments with no user permissions in play —
  const RC = "2c000000-0000-0000-0000-0000000000d1";
  await asCompany(C1, () => db.exec(`insert into receipts(id,company_id,receipt_no,customer_id,booking_id,received_on,amount,method,deposit_account)
      values ('${RC}','${C1}','RCT-00020','${CUST}','${BKD}','2025-09-25',60000,'cash','${CASH}');
    insert into receipt_allocations(company_id,receipt_id,installment_id,amount) values ('${C1}','${RC}','${INS}',60000)`))
    .then(() => ok("installment: receipts move it due > partial with no user permission needed"), (e) => bad("system path", e));
  await expectError("receipt: voiding needs accounts.approve", () => run("deals.edit", `select app.void_receipt('${RC}','${U}','mistake','2025-08-20')`), "accounts.approve");
  await run("accounts.approve", `select app.void_receipt('${RC}','${U}','mistake','2025-08-20')`).then(() => ok("receipt: void with accounts.approve"), (e) => bad("void perm", e));

  // — properties —
  await expectError("property: taking it off the market needs inventory.edit", () => run("deals.edit", `update properties set status='blocked' where id='${PE}'`), "inventory.edit");
  await run("inventory.edit", `update properties set status='blocked' where id='${PE}'`).then(() => ok("property: available > blocked with inventory.edit"), (e) => bad("block", e));
  await expectError("property: blocked cannot jump to cancelled", () => run(null, `update properties set status='cancelled' where id='${PE}'`), 'cannot go from "blocked" to "cancelled"');
  await run("inventory.edit", `update properties set status='available' where id='${PE}'`);
  await run("inventory.approve", `update properties set status='cancelled' where id='${PE}'`);
  await expectError("property: reinstating a withdrawn property needs inventory.approve", () => run("inventory.edit", `update properties set status='available' where id='${PE}'`), "inventory.approve");

  // — vouchers —
  const V = "ca000000-0000-0000-0000-0000000000d1";
  await asCompany(C1, () => db.exec(`insert into vouchers(id,company_id,voucher_type,number,voucher_date) values ('${V}','${C1}','JV','JV-SM-1','2025-08-10')`));
  await asCompany(C1, () => db.exec(`insert into voucher_lines(company_id,voucher_id,line_no,account_id,debit,credit) values ('${C1}','${V}',1,'${CASH}',100,0),('${C1}','${V}',2,'${SALES}',0,100)`));
  await expectError("voucher: a draft cannot be approved without being submitted", () => run(null, `update vouchers set status='approved' where id='${V}'`), 'cannot go from "draft" to "approved"');
  await run("accounts.create", `update vouchers set status='pending' where id='${V}'`).then(() => ok("voucher: draft > pending"), (e) => bad("submit", e));
  await expectError("voucher: only an approver can approve", () => run("accounts.create,accounts.edit", `update vouchers set status='approved' where id='${V}'`), "accounts.approve");
  await expectError("voucher: the status cannot be flipped to approved by hand (approving means posting)", () => run("accounts.approve", `update vouchers set status='approved' where id='${V}'`), "approved by posting it");
  await run("accounts.approve", `select app.approve_voucher('${V}','${U}')`).then(() => ok("voucher: pending > approved with accounts.approve (posts the entry)"), (e) => bad("approve", e));

  // — the lookup the API/UI uses —
  const nxt = await asCompany(C1, () => db.query(`select to_state, required_permission from app.allowed_transitions('booking','confirmed')`));
  nxt.rows.map((r) => r.to_state).join() === "cancelled,completed" ? ok("allowed_transitions('booking','confirmed') = cancelled, completed") : bad("allowed_transitions", nxt.rows);

  // — consistency: every status a table allows appears in its machine, so none is a dead end by accident —
  const expected = {
    booking: ["pending", "confirmed", "completed", "cancelled"],
    installment: ["due", "partial", "paid", "waived"],
    receipt: ["posted", "void"],
    property: ["available", "reserved", "sold", "blocked", "rented", "cancelled"],
    voucher: ["draft", "pending", "approved", "rejected", "void"],
  };
  const missing = [];
  for (const [entity, states] of Object.entries(expected)) {
    const r = await db.query(`select from_state, to_state from state_transitions where entity='${entity}'`);
    const seen = new Set(r.rows.flatMap((x) => [x.from_state, x.to_state]));
    for (const st of states) if (!seen.has(st)) missing.push(`${entity}:${st}`);
  }
  missing.length === 0 ? ok("every status of the 5 lifecycles appears in its state machine") : bad("states missing from the machine", missing.join());
}

// ═════════════════════════════════════════════════ CNIC protection (D1.5)
console.log("\nCNIC protection");
{
  // the helper: formats of one CNIC all agree, a different key gives a different hash, ciphertext is not repeatable
  const a = protectCnic("35201-1234567-1", KEYS), b = protectCnic("3520112345671", KEYS);
  a.cnic_hash === b.cnic_hash && a.cnic_enc !== b.cnic_enc ? ok("same CNIC in any format -> same hash, but a fresh ciphertext each time") : bad("helper determinism");
  cnicHash("3520112345671", Buffer.alloc(32, 1)) !== a.cnic_hash ? ok("the hash depends on the server-held key") : bad("hash ignores key");
  decryptCnic(a.cnic_enc, KEYS.dataKey) === "3520112345671" ? ok("the owner of the data key can read it back") : bad("decrypt");
  let wrong = false; try { decryptCnic(a.cnic_enc, Buffer.alloc(32, 3)); } catch { wrong = true; }
  wrong ? ok("a wrong key cannot decrypt it") : bad("wrong key decrypted");
  let short = false; try { normalizeCnic("12345"); } catch { short = true; }
  short ? ok("a CNIC that is not 13 digits is refused before it reaches the database") : bad("short cnic accepted");

  // the database
  const row = await asCompany(C1, () => db.query(`select cnic_enc, cnic_hash, cnic_last4 from parties where id='b0000000-0000-0000-0000-000000000001'`));
  !row.rows[0].cnic_enc.includes("3520112345671") && row.rows[0].cnic_last4 === "5671"
    ? ok("the stored row holds ciphertext + hash + last 4, not the digits") : bad("stored form", row.rows[0]);
  const cols = await db.query(`select column_name from information_schema.columns where table_name='parties' and column_name='cnic'`);
  cols.rows.length === 0 ? ok("there is no plain 'cnic' column any more") : bad("plain cnic column still exists");
  await expectError("a hash that is not 64 hex characters is rejected", () => asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('${C1}','Bad','x','abc','1234')`)), "check");
  await expectError("a CNIC must have all three parts or none", () => asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic_hash) values ('${C1}','Half','${cnicHash("3520199999999", KEYS.hmacKey)}')`)), "parties_cnic_complete");
  await asCompany(C1, () => db.exec(`insert into parties(company_id,display_name) values ('${C1}','No CNIC one'),('${C1}','No CNIC two')`))
    .then(() => ok("parties without a CNIC are unrestricted"), (e) => bad("null cnic", e));
  // the real point: two ciphertexts of one CNIC are different strings, so only the hash can be unique — and it is
  const c1 = protectCnic("3520188888888", KEYS), c2 = protectCnic("3520188888888", KEYS);
  await asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('${C1}','First','${c1.cnic_enc}','${c1.cnic_hash}','${c1.cnic_last4}')`));
  await expectError("the same CNIC cannot be entered twice in one company, even though the ciphertexts differ", () => asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic_enc,cnic_hash,cnic_last4) values ('${C1}','Second','${c2.cnic_enc}','${c2.cnic_hash}','${c2.cnic_last4}')`)), "parties_cnic_uq");
}

// ═════════════════════════════════════════════════ Posting guards (D1.6) & typed references (D1.7)
console.log("\nPosting guards");
{
  const U = "b1000000-0000-0000-0000-0000000000f4";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','post@x.pk','Poster')`);
  await expectError("an entry dated outside its accounting period is rejected", () => entry("e1000000-0000-0000-0000-0000000000f1", "JV-G001", P2, [[CASH, 10, 0], [SALES, 0, 10]], "2025-09-15"), "outside the accounting period");

  // a closed fiscal year takes no postings, even if its period was left open
  await asCompany(C1, () => db.exec(`insert into fiscal_years(id,company_id,name,start_date,end_date,status) values ('f0000000-0000-0000-0000-0000000000f9','${C1}','FY2040','2040-07-01','2041-06-30','closed');
    insert into accounting_periods(id,company_id,fiscal_year_id,start_date,end_date) values ('e0000000-0000-0000-0000-0000000000f9','${C1}','f0000000-0000-0000-0000-0000000000f9','2040-07-01','2040-07-31')`));
  await expectError("a closed fiscal year takes no postings", () => entry("e1000000-0000-0000-0000-0000000000f2", "JV-G002", "e0000000-0000-0000-0000-0000000000f9", [[CASH, 10, 0], [SALES, 0, 10]], "2040-07-05"), "Fiscal year is closed");

  // a document posts once
  const SRC = "2a000000-0000-0000-0000-000000000001", E1 = "e1000000-0000-0000-0000-0000000000f3";
  const post = (id, no) => asCompany(C1, async () => {
    await db.exec(`insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type,source_id) values ('${id}','${C1}','${no}','2025-08-12','${P2}','receipt','${SRC}')`);
    await db.exec(`insert into journal_lines(company_id,entry_id,line_no,account_id,debit,credit) values ('${C1}','${id}',1,'${CASH}',50,0),('${C1}','${id}',2,'${SALES}',0,50)`);
  });
  await post(E1, "JV-G003").then(() => ok("a receipt posts its journal entry"), (e) => bad("first post", e));
  await expectError("the same document cannot be posted twice", () => post("e1000000-0000-0000-0000-0000000000f4", "JV-G004"), "journal_entries_one_per_source");
  await asCompany(C1, () => db.exec(`select app.reverse_entry('${E1}','2025-08-13','duplicate check')`)).then(() => ok("its reversal may share the source document"), (e) => bad("reversal shares source", e));
  await post("e1000000-0000-0000-0000-0000000000f5", "JV-G005").then(() => bad("a reversed document was re-posted"), () => ok("a reversed document still cannot be posted again (the reversal does not free the slot)"));
}

console.log("\nTyped references on money tables");
{
  const U2 = "b1000000-0000-0000-0000-0000000000f5";
  const CUSTX = "b0000000-0000-0000-0000-0000000000e2";
  const RCPT = "2a000000-0000-0000-0000-000000000001", VCH = "ca000000-0000-0000-0000-0000000000e1";
  const CTX = "c1000000-0000-0000-0000-0000000000e1";
  await asCompany(C1, () => db.exec(`insert into combined_transactions(id,company_id,txn_no,txn_date,kind,party_id,total_amount) values ('${CTX}','${C1}','CT-T1','2025-09-10','combined_receipt','b0000000-0000-0000-0000-000000000001',100)`));
  const item = (cols, vals, type = "receipt") => asCompany(C1, () => db.exec(`insert into combined_transaction_items(company_id,combined_txn_id,item_type,${cols},direction,amount) values ('${C1}','${CTX}','${type}',${vals},'in',100)`));
  await expectError("a combined item cannot point at a receipt that does not exist", () => item("receipt_id", "gen_random_uuid()"), "tenant_fk");
  await expectError("a combined item must name exactly one document", () => item("receipt_id, voucher_id", `'${RCPT}','${VCH}'`), "check");
  await expectError("a combined item must name nothing but the document its type says", () => item("voucher_id", `'${VCH}'`, "receipt"), "check");
  await item("receipt_id", `'${RCPT}'`).then(() => ok("a combined item pointing at a real receipt is accepted"), (e) => bad("valid item", e));
  await asCompany(C2, () => db.exec(`insert into parties(id,company_id,display_name) values ('${CUSTX}','${C2}','C2 payer');
    insert into combined_transactions(id,company_id,txn_no,txn_date,kind,party_id,total_amount) values ('c1000000-0000-0000-0000-0000000000e2','${C2}','CT-T2','2025-09-10','combined_receipt','${CUSTX}',100)`));
  await expectError("company 2 cannot settle company 1's receipt", () => asCompany(C2, () => db.exec(`insert into combined_transaction_items(company_id,combined_txn_id,item_type,receipt_id,direction,amount) values ('${C2}','c1000000-0000-0000-0000-0000000000e2','receipt','${RCPT}','in',100)`)), "tenant_fk");

  const tax = (cols, vals, type) => asCompany(C1, () => db.exec(`insert into document_taxes(company_id,doc_type,${cols},tax_code_id,base_amount,rate_pct,tax_amount,direction)
    values ('${C1}','${type}',${vals},(select id from tax_codes limit 1),1000,6,60,'output')`));
  await expectError("a tax line cannot point at a booking that does not exist", () => tax("booking_id", "gen_random_uuid()", "booking"), "tenant_fk");
  await expectError("a tax line must name exactly one document", () => tax("booking_id, receipt_id", `'${B2}','${RCPT}'`, "booking"), "check");
  await expectError("a tax line's document must match its type", () => tax("receipt_id", `'${RCPT}'`, "booking"), "check");
  await tax("receipt_id", `'${RCPT}'`, "receipt").then(() => ok("a tax line on a real receipt is accepted"), (e) => bad("valid tax line", e));

  await expectError("a purchase-order commitment must name its purchase order", () => asCompany(C1, () => db.exec(`insert into budget_commitments(company_id,budget_line_id,source_type,amount,committed_on) values ('${C1}',(select id from budget_lines limit 1),'purchase_order',100,'2025-08-20')`)), "check");
  await expectError("a manual commitment names no document", () => asCompany(C1, () => db.exec(`insert into budget_commitments(company_id,budget_line_id,source_type,source_id,amount,committed_on) values ('${C1}',(select id from budget_lines limit 1),'manual',gen_random_uuid(),100,'2025-08-20')`)), "check");
}

// ═════════════════════════════════════════════════ Audit trail & conventions (D1.8)
console.log("\nAudit trail & conventions");
{
  const U = "b1000000-0000-0000-0000-0000000000f6";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','audit@x.pk','Auditor')`);
  const asUser = (fn) => asCompany(C1, async () => {
    await db.exec(`select set_config('app.user_id','${U}', true), set_config('app.request_id','req-audit-1', true)`);
    return fn();
  });
  const PROP = "d0000000-0000-0000-0000-000000000001";                 // PRP-1000, list price 12,000,000
  const trail = (where) => asCompany(C1, () => db.query(`select action, user_id, before_data, after_data, request_id from audit_log where ${where} order by id`));

  await asUser(() => db.exec(`update properties set list_price = 12500000 where id='${PROP}'`));
  const a = (await trail(`entity_type='properties' and entity_id='${PROP}' and action='update'`)).rows;
  a.length === 1 && Number(a[0].before_data.list_price) === 12000000 && Number(a[0].after_data.list_price) === 12500000
    ? ok("a price change is recorded with the old and the new price") : bad("price audit", JSON.stringify(a));
  a[0]?.user_id === U && a[0]?.request_id === "req-audit-1" ? ok("...who made it, and under which request") : bad("audit actor", a[0]);
  Object.keys(a[0]?.after_data ?? {}).join() === "list_price" ? ok("only the changed field is stored, not the whole row") : bad("audit diff", a[0]?.after_data);

  // bookkeeping-only updates leave no trace
  const before = (await trail(`entity_type='parties'`)).rows.length;
  await asUser(() => db.exec(`update parties set display_name = display_name where id='b0000000-0000-0000-0000-000000000001'`));
  (await trail(`entity_type='parties'`)).rows.length === before ? ok("an update that changes nothing is not audited") : bad("noise audited");

  // status changes, archiving, documents
  const st = (await trail(`entity_type='properties' and action='status_change'`)).rows;
  st.length > 0 && st[0].before_data.status && st[0].after_data.status ? ok("property status changes are audited as status_change") : bad("status audit", JSON.stringify(st.slice(0, 1)));
  await asUser(() => db.exec(`update parties set deleted_at = now() where display_name = 'No CNIC two'`));
  (await trail(`entity_type='parties' and action='delete'`)).rows.length === 1 ? ok("archiving a party is audited as delete") : bad("archive audit");
  (await trail(`entity_type='receipts' and action='status_change'`)).rows.length >= 1 ? ok("voiding a receipt is in the trail") : bad("receipt void audit");
  (await trail(`entity_type='receipt_allocations' and action='create'`)).rows.length >= 2 ? ok("allocations (including reversals) are in the trail") : bad("allocation audit");
  (await trail(`entity_type='bookings' and action='create'`)).rows.length >= 1 ? ok("new bookings are in the trail") : bad("booking audit");

  // the trail is itself protected
  await expectError("the audit trail cannot be edited", () => asCompany(C1, () => db.exec(`update audit_log set action = 'x'`)), "append-only");
  await expectError("the audit trail cannot be deleted from", () => asCompany(C1, () => db.exec(`delete from audit_log`)), "append-only");
  const other = await asCompany(C2, () => db.query(`select count(*)::int n from audit_log where entity_type = 'properties' and entity_id = '${PROP}'`));
  other.rows[0].n === 0 ? ok("another company cannot read this company's trail") : bad("audit isolation", other.rows);

  // conventions
  const gaps = await db.query(`select table_name, problem from v_convention_gaps`);
  gaps.rows.length === 0 ? ok("convention lint: every registered document and master table complies") : bad("convention gaps", JSON.stringify(gaps.rows));
  await asCompany(C1, () => db.exec(`insert into gl_accounts(company_id,code,name,account_class,category,is_group) values ('${C1}','09999999','Lock test','asset','asset_cash',false)`));
  await asCompany(C1, () => db.exec(`update gl_accounts set name = 'Lock test 2' where code = '09999999'`));
  const gl = (await asCompany(C1, () => db.query(`select version from gl_accounts where code = '09999999'`))).rows[0].version;
  gl === 2 ? ok("master data now carries a version that moves on every edit (optimistic locking)") : bad("gl version", gl);
}

// ═════════════════════════════════════════════════ Branches, teams & data scope (D1.9)
console.log("\nBranches, teams & data scope");
{
  const ORG = "00000000-0000-0000-0000-0000000000a1";
  const u = (n) => `b1000000-0000-0000-0000-0000000001${n}0`;
  const [U1_, U2_, U3_, U4_, U5_, UOUT] = [1, 2, 3, 4, 5, 6].map(u);
  const BR1 = "bb000000-0000-0000-0000-000000000001", BR2 = "bb000000-0000-0000-0000-000000000002";
  const T1 = "7e000000-0000-0000-0000-000000000001", T2 = "7e000000-0000-0000-0000-000000000002";
  const role = (n) => `a9000000-0000-0000-0000-00000000000${n}`;
  const SCOPES = { own: role(1), team: role(2), branch: role(3), company: role(4), project: role(5), nogrant: role(6) };

  await db.exec(`insert into users(id,email,full_name) values
    ${[U1_, U2_, U3_, U4_, U5_, UOUT].map((id, i) => `('${id}','scope${i}@x.pk','Scope User ${i}')`).join(",")}`);
  await db.exec(`insert into roles(id,org_id,name) values ${Object.entries(SCOPES).map(([k, id]) => `('${id}','${ORG}','Scope ${k}')`).join(",")};
    insert into role_permissions(role_id,module,can_view,data_scope) values
      ('${SCOPES.own}','deals',true,'own'), ('${SCOPES.team}','deals',true,'team'), ('${SCOPES.branch}','deals',true,'branch'),
      ('${SCOPES.company}','deals',true,'company'), ('${SCOPES.project}','deals',true,'project')`);   // nogrant: no row at all

  await asCompany(C1, () => db.exec(`
    insert into branches(id,company_id,code,name,city,is_head_office) values ('${BR1}','${C1}','LHR','Lahore Head Office','Lahore',true), ('${BR2}','${C1}','ISB','Islamabad Branch','Islamabad',false);
    insert into company_members(company_id,user_id,role_id,branch_id) values
      ('${C1}','${U1_}','${SCOPES.own}','${BR1}'), ('${C1}','${U2_}','${SCOPES.own}','${BR1}'), ('${C1}','${U3_}','${SCOPES.own}','${BR1}'),
      ('${C1}','${U4_}','${SCOPES.own}','${BR2}'), ('${C1}','${U5_}','${SCOPES.own}',null);
    insert into teams(id,company_id,branch_id,name,lead_user_id) values ('${T1}','${C1}','${BR1}','Phase 1 Sales','${U1_}'), ('${T2}','${C1}','${BR2}','Islamabad Sales','${U4_}');
    insert into team_members(company_id,team_id,user_id,is_lead) values ('${C1}','${T1}','${U1_}',true), ('${C1}','${T1}','${U2_}',false), ('${C1}','${T2}','${U4_}',true)`))
    .then(() => ok("a company gets branches, teams and branch-based staff"), (e) => bad("branch setup", e));

  // structure
  await expectError("only one head office per company", () => asCompany(C1, () => db.exec(`insert into branches(company_id,code,name,is_head_office) values ('${C1}','KHI','Karachi',true)`)), "branches_one_head_office");
  await expectError("branch codes are unique within a company", () => asCompany(C1, () => db.exec(`insert into branches(company_id,code,name) values ('${C1}','ISB','Another Islamabad')`)), "branches_company_id_code_key");
  await asCompany(C2, () => db.exec(`insert into branches(company_id,code,name,is_head_office) values ('${C2}','LHR','Company Two Lahore',true)`)).then(() => ok("another company can use the same branch code and have its own head office"), (e) => bad("c2 branch", e));
  await expectError("a team cannot sit in another company's branch", () => asCompany(C2, () => db.exec(`insert into teams(company_id,branch_id,name) values ('${C2}','${BR1}','Poachers')`)), "teams_branch_id_tenant_fk");
  await expectError("only members of the company can join its teams", () => asCompany(C1, () => db.exec(`insert into team_members(company_id,team_id,user_id) values ('${C1}','${T1}','${UOUT}')`)), "team_members_company_id_user_id_fkey");
  await expectError("a staff member cannot be placed in another company's branch", () => asCompany(C1, () => db.exec(`update company_members set branch_id = gen_random_uuid() where user_id = '${U5_}'`)), "company_members_branch_id_tenant_fk");

  // scope: always evaluated for U1 (branch 1, team 1), with U1's role switched between scopes
  const inScope = (me, module, owner) => asCompany(C1, async () => {
    await db.exec(`select set_config('app.user_id','${me}', true)`);
    return (await db.query(`select app.user_in_scope('${module}', ${owner ? `'${owner}'` : "null"}) r`)).rows[0].r;
  });
  const setRole = (roleId) => asCompany(C1, () => db.exec(`update company_members set role_id='${roleId}' where user_id='${U1_}'`));
  const expectScope = async (name, role, cases) => {
    await setRole(role);
    const got = []; for (const [label, owner, want] of cases) got.push([label, await inScope(U1_, "deals", owner), want]);
    const wrong = got.filter(([, g, w]) => g !== w);
    wrong.length === 0 ? ok(name) : bad(name, wrong.map(([l, g, w]) => `${l}: got ${g}, want ${w}`).join("; "));
  };
  await expectScope("scope 'own': only my own records", SCOPES.own, [["me", U1_, true], ["a teammate", U2_, false], ["nobody", null, false]]);
  await expectScope("scope 'team': me and the people on my teams", SCOPES.team, [["me", U1_, true], ["teammate", U2_, true], ["same branch, no team", U3_, false], ["other branch", U4_, false]]);
  await expectScope("scope 'branch': me and everyone in my branch", SCOPES.branch, [["me", U1_, true], ["teammate", U2_, true], ["same branch, no team", U3_, true], ["other branch", U4_, false], ["no branch", U5_, false]]);
  await expectScope("scope 'company': everyone", SCOPES.company, [["me", U1_, true], ["other branch", U4_, true], ["no branch", U5_, true]]);
  await expectScope("scope 'project' fails closed until project assignment exists", SCOPES.project, [["me", U1_, false], ["teammate", U2_, false]]);
  await setRole(SCOPES.nogrant);
  (await inScope(U1_, "deals", U1_)) === false ? ok("a role with no grant for the module sees nothing, not even its own") : bad("no grant");
  (await inScope(UOUT, "deals", UOUT)) === false ? ok("someone who is not a member of the company sees nothing") : bad("non-member");
  await setRole(SCOPES.team);
  (await inScope(U1_, "budgets", U2_)) === false ? ok("a module the role was never granted is closed") : bad("other module");
}

// ═════════════════════════════════════════════════ Reconciliation (D1.10)
console.log("\nReconciliation");
{
  const rows = async () => (await db.query(`select check_name, entity_type, detail from v_reconciliation order by check_name`)).rows;
  const counts = async () => Object.fromEntries((await db.query(`select check_name, problems::int p from app.reconciliation_summary()`)).rows.map((r) => [r.check_name, r.p]));

  // 1. everything the whole suite did above leaves the books consistent
  const healthy = await rows();
  healthy.length === 0 ? ok("after every scenario above, all 9 reconciliation checks are clean") : bad("database is not clean", JSON.stringify(healthy.slice(0, 5)));
  Object.keys(await counts()).length === 9 ? ok("the summary lists all 9 checks, clean ones included") : bad("summary shape");

  // 2. break things the way a bad data fix would (triggers off), and make sure each break is caught
  const PERIOD = "e0000000-0000-0000-0000-000000000002";
  const PROP = "d0000000-0000-0000-0000-000000000001", INST = "1a000000-0000-0000-0000-000000000003", RCPT = "2a000000-0000-0000-0000-000000000001";
  const origStatus = (await db.query(`select status from properties where id = '${PROP}'`)).rows[0].status;
  const GHOST = "99999999-0000-0000-0000-000000000001", HOLDED = "d0000000-0000-0000-0000-0000000000a2";
  await db.exec(`set session_replication_role = replica`);
  await db.exec(`
    update installments set paid_amount = 1000 where id = '${INST}';                                  -- says paid, no allocation behind it
    update properties set status = 'sold' where id = '${PROP}';                                       -- plot map says sold, no booking
    update account_balances set debit_total = debit_total + 5 where company_id = '${C1}' and account_id = '${CASH}' and period_id = '${PERIOD}';
    insert into receipt_allocations(id,company_id,receipt_id,installment_id,amount) values ('a1000000-0000-0000-0000-0000000000f1','${C1}','${RCPT}','${INST}',999999);
    insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type,source_id) values ('e1000000-0000-0000-0000-0000000000f9','${C1}','JV-GHOST','2025-08-20','${PERIOD}','receipt','${GHOST}');
    insert into property_holds(id,company_id,property_id,held_at,expires_at) values ('a2000000-0000-0000-0000-0000000000f1','${C1}','${HOLDED}', now() - interval '5 hours', now() - interval '3 hours');
  `);
  await db.exec(`set session_replication_role = origin`);
  const broken = await counts();
  const want = ["paid_amount_drift", "property_status_drift", "ledger_balance_drift", "receipt_over_allocated", "orphan_journal_source", "stale_hold"];
  const missed = want.filter((k) => !(broken[k] > 0));
  missed.length === 0 ? ok("each of 6 kinds of damage is reported") : bad("damage not detected", missed.join());

  // 3. repair, and it goes quiet again
  await db.exec(`set session_replication_role = replica`);
  await db.exec(`
    delete from receipt_allocations where id = 'a1000000-0000-0000-0000-0000000000f1';
    delete from journal_entries where id = 'e1000000-0000-0000-0000-0000000000f9';
    delete from property_holds where id = 'a2000000-0000-0000-0000-0000000000f1';
    update installments set paid_amount = 0 where id = '${INST}';
    update properties set status = '${origStatus}' where id = '${PROP}';
    update account_balances set debit_total = debit_total - 5 where company_id = '${C1}' and account_id = '${CASH}' and period_id = '${PERIOD}';
  `);
  await db.exec(`set session_replication_role = origin`);
  const fixed = await rows();
  fixed.length === 0 ? ok("after the repair every check is clean again") : bad("still dirty after repair", JSON.stringify(fixed.slice(0, 5)));
}

// ═════════════════════════════════════════════════ Payment schedule adds up to the price
console.log("\nPayment schedule");
{
  const U = "b1000000-0000-0000-0000-0000000000f7";
  const CUST = "b0000000-0000-0000-0000-000000000001";
  const PRJ = "c0000000-0000-0000-0000-000000000001", TYPE = "70000000-0000-0000-0000-000000000001";
  const P = (n) => `d0000000-0000-0000-0000-0000000000e${n}`;
  await db.exec(`insert into users(id,email,full_name) values ('${U}','plan@x.pk','Planner')`);
  await asCompany(C1, () => db.exec(`insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
    ('${P(1)}','${C1}','${PRJ}','${TYPE}','PRP-4001','Plot F',1000000), ('${P(2)}','${C1}','${PRJ}','${TYPE}','PRP-4002','Plot G',1000000),
    ('${P(3)}','${C1}','${PRJ}','${TYPE}','PRP-4003','Plot H',1000000), ('${P(4)}','${C1}','${PRJ}','${TYPE}','PRP-4004','Plot I',1000000),
    ('${P(5)}','${C1}','${PRJ}','${TYPE}','PRP-4005','Plot J',1.00), ('${P(6)}','${C1}','${PRJ}','${TYPE}','PRP-4006','Plot K',1000000)`));
  const q = (sql) => asCompany(C1, () => db.query(sql));
  const book = (prop, type = "installment") => asCompany(C1, async () => (await db.query(`select app.create_booking('${prop}','${CUST}','${type}','${U}') id`)).rows[0].id);
  const sched = (id) => q(`select seq, kind, due_date::text d, amount from installments where booking_id='${id}' order by seq`);

  // — building a schedule: remainder goes to the last installment —
  const B = await book(P(1));
  const n = (await q(`select app.build_schedule('${B}', 100000, 7, '2025-11-05') n`)).rows[0].n;
  const rows = (await sched(B)).rows;
  const total = rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);
  n === 8 && rows.length === 8 && rows[0].kind === "down_payment" && total === 100000000
    ? ok("100,000 down + 7 installments: 8 rows adding up to exactly 1,000,000.00") : bad("schedule shape", JSON.stringify({ n, total, first: rows[0] }));
  Number(rows[1].amount) === 128571.42 && Number(rows[7].amount) === 128571.48
    ? ok("the rounding remainder (0.06) lands in the last installment") : bad("remainder", `${rows[1].amount} / ${rows[7].amount}`);
  rows[3].d === "2026-01-05" ? ok("installments fall due monthly from the first due date") : bad("due dates", rows[3].d);
  await expectError("a booking cannot be given a second schedule", () => q(`select app.build_schedule('${B}', 0, 3, '2025-12-01')`), "already has a payment schedule");

  // — balloon and quarterly installments —
  const BB = await book(P(2));
  await q(`select app.build_schedule('${BB}', 100000, 2, '2025-11-01', 3, 200000, '2026-12-01')`);
  const bb = (await sched(BB)).rows;
  bb.map((r) => r.kind).join() === "down_payment,installment,installment,balloon" && bb[2].d === "2026-02-01" && Number(bb[1].amount) === 350000 && Number(bb[3].amount) === 200000
    ? ok("down payment + quarterly installments + balloon, all adding up") : bad("balloon schedule", JSON.stringify(bb));

  // — refusals —
  const BC = await book(P(3), "cash");
  await expectError("a cash booking has no payment schedule", () => q(`select app.build_schedule('${BC}', 0, 3, '2025-12-01')`), "Only installment bookings");
  const BD = await book(P(4));
  await expectError("down payment + balloon larger than the price leave nothing to spread", () => q(`select app.build_schedule('${BD}', 900000, 3, '2025-12-01', 1, 100000, '2026-01-01')`), "leave nothing");
  await expectError("zero installments must still add up to the price", () => q(`select app.build_schedule('${BD}', 400000, 0, null)`), "must equal the price");
  await expectError("a balloon needs a due date", () => q(`select app.build_schedule('${BD}', 100000, 3, '2025-12-01', 1, 50000, null)`), "balloon payment needs a due date");
  const BT = await book(P(5));
  await expectError("too many installments for a tiny amount is refused, not rounded to zero", () => q(`select app.build_schedule('${BT}', 0, 200, '2025-12-01')`), "Too many installments");
  (await sched(BT)).rows.length === 0 ? ok("a refused schedule leaves nothing behind") : bad("partial schedule left");

  // — confirming and completing —
  await expectError("an installment booking cannot be confirmed without a schedule", () => q(`update bookings set status='confirmed' where id='${BD}'`), "needs its payment schedule");
  await q(`insert into installments(company_id,booking_id,seq,due_date,amount) values ('${C1}','${BD}',1,'2025-12-01',500000)`);
  await expectError("a schedule that does not add up to the price cannot be confirmed", () => q(`update bookings set status='confirmed' where id='${BD}'`), "does not add up");
  await q(`update bookings set status='confirmed' where id='${B}'`).then(() => ok("a schedule that adds up lets the booking be confirmed"), (e) => bad("confirm", e));
  await q(`update bookings set status='confirmed' where id='${BC}'`).then(() => ok("a cash booking is confirmed without a schedule"), (e) => bad("cash confirm", e));

  // — locked after confirmation —
  await expectError("after confirmation an installment cannot be changed on its own", () => q(`update installments set amount = amount + 1000 where booking_id='${B}' and seq = 2`), "does not add up");
  await asCompany(C1, () => db.exec(`update installments set amount = amount + 1000 where booking_id='${B}' and seq = 2;
    update installments set amount = amount - 1000 where booking_id='${B}' and seq = 8`)).then(() => ok("a reschedule that moves money between installments (same total) is allowed"), (e) => bad("reschedule", e));
  await expectError("after confirmation a new installment cannot be added on its own", () => q(`insert into installments(company_id,booking_id,seq,due_date,amount) values ('${C1}','${B}',99,'2026-12-01',500)`), "does not add up");
  await expectError("after confirmation the discount cannot change on its own", () => q(`update bookings set discount = 5000 where id='${B}'`), "does not add up");
  await asCompany(C1, () => db.exec(`update bookings set discount = 5000 where id='${B}';
    update installments set amount = amount - 5000 where booking_id='${B}' and seq = 8`)).then(() => ok("a discount is allowed when the schedule is reduced with it"), (e) => bad("discount with schedule", e));

  // — completing —
  await expectError("a booking cannot complete while installments are still due", () => q(`update bookings set status='completed' where id='${B}'`), "still unpaid");
  await q(`update installments set status='waived' where booking_id='${B}'`);
  await q(`update bookings set status='completed' where id='${B}'`).then(() => ok("a booking completes once every installment is paid or waived"), (e) => bad("complete", e));

  // — reconciliation backs it up —
  await db.exec(`set session_replication_role = replica`);
  await db.exec(`update installments set amount = amount + 7 where booking_id='${BB}' and seq = 1`);
  await db.exec(`update bookings set status='confirmed' where id='${BB}'`);
  await db.exec(`set session_replication_role = origin`);
  const flagged = (await db.query(`select entity_id from v_reconciliation where check_name='booking_schedule_mismatch'`)).rows.map((r) => r.entity_id);
  flagged.length === 1 && flagged[0] === BB ? ok("reconciliation flags a confirmed booking whose schedule does not add up") : bad("schedule reconciliation", JSON.stringify(flagged));
  await db.exec(`set session_replication_role = replica`);
  await db.exec(`update installments set amount = amount - 7 where booking_id='${BB}' and seq = 1`);
  await db.exec(`set session_replication_role = origin`);
  const clean = (await db.query(`select * from v_reconciliation`)).rows;
  clean.length === 0 ? ok("...and goes quiet again once it is repaired") : bad("not clean", JSON.stringify(clean.slice(0, 3)));
}


// ═════════════════════════════════════════════════ Sign-in lookup (own memberships)
console.log("\nSign-in lookup");
{
  const ids = (n) => `b1000000-0000-0000-0000-0000000001${n}0`;
  const [A, B] = [ids(1), ids(4)];                       // two members of company 1 from the branches test
  const asPerson = async (user, fn) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role app_user`);
      if (user) await db.exec(`select set_config('app.user_id','${user}', true)`);
      const r = await fn(); await db.exec("commit"); return r;
    } catch (e) { await db.exec("rollback"); throw e; }
  };
  const mine = await asPerson(A, () => db.query(`select company_id, user_id from company_members`));
  mine.rows.length === 1 && mine.rows[0].user_id === A && mine.rows[0].company_id === C1
    ? ok("before choosing a company, a person sees exactly their own membership(s)") : bad("own memberships", JSON.stringify(mine.rows));
  (await asPerson(null, () => db.query(`select 1 from company_members`))).rows.length === 0
    ? ok("with no user and no company, no memberships are visible") : bad("anonymous memberships");
  const upd = await asPerson(A, () => db.query(`update company_members set status = 'suspended' where user_id = '${A}' returning 1`));
  upd.rows.length === 0 ? ok("that visibility is read-only: nothing can be changed without the company context") : bad("membership write via own policy");
  const other = await asPerson(A, () => db.query(`select 1 from company_members where user_id = '${B}'`));
  other.rows.length === 0 ? ok("other people's memberships stay hidden") : bad("saw someone else's membership");
}

// ═════════════════════════════════════════════════ Migration 0002: sizes, company defaults, blocks
console.log("\nSizes, company defaults, blocks");
{
  const PRJ1 = "c0000000-0000-0000-0000-000000000001", PRJ2 = "c0000000-0000-0000-0000-0000000000b2";
  const TYPE = "70000000-0000-0000-0000-000000000001";
  const sqft = async (company, v, u) => Number((await db.query(`select app.normalize_area('${company}', ${v}, '${u}') n`)).rows[0].n);

  // sizes: the marla is a company setting, the other units are fixed
  const A = sqft(C2, 5, "marla");
  (await A) === 1361.25 ? ok("5 marla = 1,361.25 sq ft with the standard 272.25") : bad("marla default", await A);
  (await sqft(C2, 1, "kanal")) === 5445 ? ok("1 kanal = 20 marla = 5,445 sq ft") : bad("kanal");
  (await sqft(C2, 1000, "sqft")) === 1000 && (await sqft(C2, 10, "sqyd")) === 90 && (await sqft(C2, 1, "acre")) === 43560
    ? ok("sq ft, sq yd and acre use their fixed factors") : bad("fixed units");
  await db.exec(`update companies set settings = settings || '{"marla_sqft": 272}' where id = '${C1}'`);
  (await sqft(C1, 5, "marla")) === 1360 ? ok("a company that sets its own marla (272) gets 5 marla = 1,360") : bad("company marla", await sqft(C1, 5, "marla"));
  await expectError("a zero size is refused", () => db.query(`select app.normalize_area('${C1}', 0, 'marla')`), "greater than zero");
  await expectError("an unknown unit is refused, not turned into NULL", () => db.query(`select app.normalize_area('${C1}', 5, 'furlong')`), "Unknown size unit");

  // standard property types and defaults for a new company
  const before = Number((await db.query(`select count(*)::int n from property_types where company_id='${C2}'`)).rows[0].n);
  const added = Number((await db.query(`select app.seed_company_defaults('${C2}') n`)).rows[0].n);
  const total = Number((await db.query(`select count(*)::int n from property_types where company_id='${C2}'`)).rows[0].n);
  total === 8 && added === 8 - before ? ok(`a company gets the 8 standard property types (only the ${added} missing ones were added)`) : bad("seed types", { before, added, total });
  Number((await db.query(`select app.seed_company_defaults('${C2}') n`)).rows[0].n) === 0 ? ok("running it again adds nothing") : bad("seed not idempotent");
  const settings = (await db.query(`select (select settings ->> 'marla_sqft' from companies where id='${C2}') c2, (select settings ->> 'marla_sqft' from companies where id='${C1}') c1`)).rows[0];
  settings.c2 === "272.25" && settings.c1 === "272" ? ok("the marla default is filled in, and a company's own value is never overwritten") : bad("seed settings", settings);
  const unit = (await db.query(`select name from property_types where company_id='${C2}' and code='kanal_x'`)).rows.length;
  unit === 0 ? ok("only the listed types exist") : bad("unexpected type");

  // a block belongs to its project
  await asCompany(C1, () => db.exec(`insert into projects(id,company_id,code,name,type) values ('${PRJ2}','${C1}','PRJ-002','Second Project','residential');
    insert into project_blocks(id,company_id,project_id,name) values ('bc000000-0000-0000-0000-000000000001','${C1}','${PRJ1}','Block A'),('bc000000-0000-0000-0000-000000000002','${C1}','${PRJ2}','Block X')`));
  const prop = (code, project, block) => asCompany(C1, () => db.exec(`insert into properties(company_id,project_id,block_id,type_id,code,title,list_price)
    values ('${C1}',${project ? `'${project}'` : "null"},${block ? `'${block}'` : "null"},'${TYPE}','${code}','${code}',1000)`));
  await prop("PRP-BLK-1", PRJ1, "bc000000-0000-0000-0000-000000000001").then(() => ok("a property in a block of its own project is accepted"), (e) => bad("own block", e));
  await prop("PRP-BLK-2", PRJ1, null).then(() => ok("a property with no block is accepted"), (e) => bad("no block", e));
  await expectError("a property cannot use another project's block", () => prop("PRP-BLK-3", PRJ1, "bc000000-0000-0000-0000-000000000002"), "does not belong");
  await expectError("a property with a block but no project is refused", () => prop("PRP-BLK-4", null, "bc000000-0000-0000-0000-000000000001"), "does not belong");
  await expectError("moving a property into another project's block is refused", () => asCompany(C1, () => db.exec(`update properties set block_id='bc000000-0000-0000-0000-000000000002' where code='PRP-BLK-1'`)), "does not belong");
}

// ═════════════════════════════════════════════════ Migration 0003: banks, chart of accounts, fiscal periods
console.log("\nBanks, chart of accounts, fiscal periods");
{
  const C3 = "00000000-0000-0000-0000-0000000000d3";
  await db.exec(`insert into companies(id,org_id,name) values ('${C3}','00000000-0000-0000-0000-0000000000a1','Co Three')`);
  const U = "b1000000-0000-0000-0000-0000000000f9";
  await db.exec(`insert into users(id,email,full_name) values ('${U}','banker@x.pk','Banker')`);

  // — the bank catalog —
  const kinds = (await db.query(`select kind, count(*)::int n from banks group by kind order by kind`)).rows;
  const total = kinds.reduce((t, k) => t + k.n, 0);
  total >= 40 && kinds.length === 6 ? ok(`the bank catalog has ${total} Pakistani banks across 6 kinds`) : bad("bank catalog", JSON.stringify(kinds));
  const must = (await db.query(`select count(*)::int n from banks where short_name in ('HBL','UBL','MCB','ABL','NBP','Meezan','Alfalah','Askari','Faysal','Habib Metro')`)).rows[0].n;
  must === 0 ? bad("short names") : ok("the major banks are present (HBL, UBL, MCB, NBP, Meezan, Alfalah ...)");
  await expectError("a bank name cannot be listed twice", () => db.query(`insert into banks(name,short_name,kind) values ('Habib Bank Limited','x','private')`), "banks_name_key");

  // — the standard chart of accounts —
  const added = await asCompany(C3, async () => Number((await db.query(`select app.seed_chart_of_accounts('${C3}') n`)).rows[0].n));
  added >= 75 ? ok(`a new company gets a standard chart of ${added} accounts`) : bad("coa size", added);
  const again = await asCompany(C3, async () => Number((await db.query(`select app.seed_chart_of_accounts('${C3}') n`)).rows[0].n));
  again === 0 ? ok("seeding the chart again adds nothing") : bad("coa not idempotent", again);
  const tree = (await asCompany(C3, () => db.query(`select a.code, a.is_group, a.requires_party, p.code as parent from gl_accounts a left join gl_accounts p on p.id = a.parent_id where a.code in ('03.01.01.0001','03.01.01','03','03.01.02.0001','02.01.01.0001')`))).rows;
  const by = Object.fromEntries(tree.map((r) => [r.code, r]));
  by["03.01.01.0001"].parent === "03.01.01" && by["03.01.01"].parent === "03.01" && by["03"].parent === null
    ? ok("accounts are linked to their parents by code (account > group > class)") : bad("coa parents", JSON.stringify(by));
  by["03.01.02.0001"].requires_party && by["02.01.01.0001"].requires_party && by["03.01.01"].is_group && !by["03.01.01.0001"].is_group
    ? ok("customer receivables and supplier payables demand a party; headers are groups") : bad("coa flags", JSON.stringify(by));

  // — company bank accounts —
  const HBL = (await db.query(`select id from banks where short_name = 'HBL'`)).rows[0].id;
  const acct = (no, bank = HBL, name = null, iban = null) => asCompany(C3, async () => (await db.query(
    `select app.create_bank_account('${C3}', ${bank ? `'${bank}'` : "null"}, ${name ? `'${name}'` : "null"}, 'Main Branch', '0123', 'Co Three Current A/C', '${no}', ${iban ? `'${iban}'` : "null"}, '${U}') id`)).rows[0].id);
  const b1 = await acct("0123-456789", HBL, null, "PK36HABB0000000123456702");
  const g1 = (await asCompany(C3, () => db.query(`select a.code, a.name, a.category, a.account_class, p.code parent from bank_accounts b join gl_accounts a on a.id = b.gl_account_id join gl_accounts p on p.id = a.parent_id where b.id = '${b1}'`))).rows[0];
  g1.code === "03.01.01.0002" && g1.category === "asset_bank" && g1.account_class === "asset" && g1.parent === "03.01.01" && g1.name === "HBL - 0123-456789"
    ? ok("a bank account gets its own ledger account under Cash & Bank (03.01.01.0002)") : bad("bank gl account", JSON.stringify(g1));
  const b2 = await acct("55-1001", null, "Local Co-operative Bank");
  const g2 = (await asCompany(C3, () => db.query(`select a.code, b.bank_name, b.bank_id from bank_accounts b join gl_accounts a on a.id = b.gl_account_id where b.id = '${b2}'`))).rows[0];
  g2.code === "03.01.01.0003" && g2.bank_name === "Local Co-operative Bank" && g2.bank_id === null
    ? ok("a bank that is not in the catalog can be typed in (next code 03.01.01.0003)") : bad("typed bank", JSON.stringify(g2));
  await expectError("the same bank account cannot be added twice", () => acct("0123-456789"), "bank_accounts_company_id_bank_name_account_no_key");
  await expectError("an IBAN must look like a Pakistani IBAN", () => acct("77-1", HBL, null, "GB29NWBK60161331926819"), "check");
  await expectError("a bank account needs a bank", () => asCompany(C3, () => db.exec(`select app.create_bank_account('${C3}', null, '  ', null, null, 'T', '1', null, '${U}')`)), "Choose a bank");
  await expectError("a bank account needs an account number", () => asCompany(C3, () => db.exec(`select app.create_bank_account('${C3}', '${HBL}', null, null, null, 'T', ' ', null, '${U}')`)), "account number is required");
  const seen = (await asCompany(C2, () => db.query(`select count(*)::int n from bank_accounts`))).rows[0].n;
  seen === 0 ? ok("another company cannot see these bank accounts") : bad("bank account isolation", seen);
  const foreignGl = (await db.query(`select id as gl_account_id from gl_accounts where company_id = '${C3}' and code = '03.01.01.0001'`)).rows[0].gl_account_id;
  await expectError("a bank account cannot point at another company's ledger account", () => asCompany(C2, () => db.exec(
    `insert into bank_accounts(company_id,gl_account_id,bank_name,account_title,account_no) values ('${C2}','${foreignGl}','X','X','9')`)), "bank_accounts_gl_account_id_tenant_fk");

  // — fiscal periods that create themselves —
  const p1 = await asCompany(C3, async () => (await db.query(`select app.ensure_period('${C3}', '2026-10-19') id`)).rows[0].id);
  const fy = (await db.query(`select f.name, f.start_date::text s, f.end_date::text e, (select count(*)::int from accounting_periods where fiscal_year_id = f.id) n from fiscal_years f join accounting_periods p on p.fiscal_year_id = f.id where p.id = '${p1}'`)).rows[0];
  fy.name === "FY2026-27" && fy.s === "2026-07-01" && fy.e === "2027-06-30" && fy.n === 12
    ? ok("a date in October 2026 creates FY2026-27 (July to June) with 12 monthly periods") : bad("ensure_period", JSON.stringify(fy));
  const p1b = await asCompany(C3, async () => (await db.query(`select app.ensure_period('${C3}', '2026-10-01') id`)).rows[0].id);
  p1b === p1 ? ok("asking again for the same month returns the same period") : bad("ensure_period not stable");
  const p2 = await asCompany(C3, async () => (await db.query(`select app.ensure_period('${C3}', '2025-08-01') id`)).rows[0].id);
  const fy2 = (await db.query(`select f.name from fiscal_years f join accounting_periods p on p.fiscal_year_id = f.id where p.id = '${p2}'`)).rows[0].name;
  fy2 === "FY2025-26" ? ok("an earlier date creates the earlier financial year (FY2025-26)") : bad("earlier year", fy2);
  await db.exec(`update companies set fiscal_year_start = 1 where id = '${C3}'`);
  const p3 = await asCompany(C3, async () => (await db.query(`select app.ensure_period('${C3}', '2028-03-05') id`)).rows[0].id);
  (await db.query(`select f.name from fiscal_years f join accounting_periods p on p.fiscal_year_id = f.id where p.id = '${p3}'`)).rows[0].name === "FY2028"
    ? ok("a company on a January year gets a calendar financial year (FY2028)") : bad("calendar year");
  const locked = await asCompany(C1, async () => (await db.query(`select app.ensure_period('${C1}', '2025-07-10') id`)).rows[0].id);
  locked === "e0000000-0000-0000-0000-000000000001" ? ok("a date inside an existing (even locked) period returns that period untouched") : bad("existing period", locked);

  const C4x = "00000000-0000-0000-0000-0000000000d4";
  await db.exec(`insert into companies(id,org_id,name) values ('${C4x}','00000000-0000-0000-0000-0000000000a1','Co Four')`);
  await db.exec(`insert into fiscal_years(company_id,name,start_date,end_date) values ('${C4x}','FY2026-27','2026-08-01','2027-07-31')`);
  await expectError("a financial year of the same name with different dates is reported, not guessed at", () => asCompany(C4x, () => db.exec(`select app.ensure_period('${C4x}', '2026-10-19')`)), "different dates");

  // — a new company's defaults now include the chart —
  const C4 = C4x;
  await asCompany(C4, () => db.exec(`select app.seed_company_defaults('${C4}')`));
  const c4 = (await asCompany(C4, () => db.query(`select (select count(*)::int from property_types) pt, (select count(*)::int from gl_accounts) gl`))).rows[0];
  c4.pt === 8 && c4.gl >= 75 ? ok("seed_company_defaults gives a new company its property types AND its chart of accounts") : bad("defaults", JSON.stringify(c4));
}

// ═════════════════════════════════════════════════ Migration 0004: the voucher engine
console.log("\nVoucher engine");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";            // the company with the seeded chart (Co Three)
  const U = "b1000000-0000-0000-0000-0000000000f9";               // the banker from the previous section (exists)
  const U2 = "b1000000-0000-0000-0000-0000000000fa";
  await db.exec(`insert into users(id,email,full_name) values ('${U2}','approver@x.pk','Approver')`);
  const PA = "9a000000-0000-0000-0000-0000000000a1", PS = "9a000000-0000-0000-0000-0000000000a2";
  await asCompany(CO, () => db.exec(`insert into parties(id,company_id,display_name) values ('${PA}','${CO}','Customer A'),('${PS}','${CO}','Supplier S')`));

  const q = (sql, perms) => asCompany(CO, async () => {
    if (perms !== undefined) await db.exec(`select set_config('app.permissions','${perms}', true)`);
    return db.query(sql);
  });
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const banks = (await db.query(`select id, gl_account_id from bank_accounts where company_id='${CO}' order by created_at`)).rows;
  const [B1, B2] = banks;

  // build a voucher: header columns + lines [accountCode, debit, credit, partyId?]
  const quote = (v) => (v === null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const mk = (type, header = {}, lines = []) => asCompany(CO, async () => {
    const no = (await db.query(`select app.next_doc_no('${CO}','${type}') n`)).rows[0].n;
    const id = crypto.randomUUID();
    const h = { id, company_id: CO, voucher_type: type, number: no, voucher_date: "2026-10-19", created_by: U, ...header };
    await db.exec(`insert into vouchers(${Object.keys(h).join(",")}) values (${Object.values(h).map(quote).join(",")})`);
    let n = 0;
    for (const [code, dr, cr, party] of lines) {
      n++;
      await db.exec(`insert into voucher_lines(company_id,voucher_id,line_no,account_id,debit,credit,party_id) values ('${CO}','${id}',${n},'${acc[code]}',${dr},${cr},${party ? `'${party}'` : "null"})`);
    }
    return id;
  });
  const submit = (id, perms) => q(`update vouchers set status='pending' where id='${id}'`, perms);
  const approve = (id, by = U, perms) => q(`select app.approve_voucher('${id}','${by}')`, perms);
  const status = async (id) => (await q(`select status from vouchers where id='${id}'`)).rows[0].status;
  const journal = async (id) => (await q(`select a.code, l.debit::float d, l.credit::float c, l.party_id from journal_lines l join journal_entries e on e.id = l.entry_id
      join gl_accounts a on a.id = l.account_id where e.source_id = '${id}' and e.reversal_of is null order by l.line_no`)).rows;
  const sameLines = (got, want) => JSON.stringify(got.map((r) => [r.code, r.d, r.c])) === JSON.stringify(want);

  // ───────── the ten voucher types ─────────
  const cpv = await mk("CPV", { control_account_id: acc["03.01.01.0001"], description: "Office rent and electricity" }, [["05.02.02.0001", 50000, 0], ["05.02.01.0001", 10000, 0]]);
  await submit(cpv); await approve(cpv);
  const cpvNo = (await q(`select number from vouchers where id='${cpv}'`)).rows[0].number;
  sameLines(await journal(cpv), [["05.02.02.0001", 50000, 0], ["05.02.01.0001", 10000, 0], ["03.01.01.0001", 0, 60000]])
    ? ok("CPV cash payment: expenses debited, cash credited once for the total (60,000)") : bad("CPV journal", JSON.stringify(await journal(cpv)));
  const entryNo = (await q(`select e.entry_no from journal_entries e where e.source_id='${cpv}'`)).rows[0].entry_no;
  entryNo === cpvNo && /^CPV-\d{5}$/.test(cpvNo) ? ok("the ledger entry carries the voucher number (" + cpvNo + ")") : bad("entry no", { entryNo, cpvNo });

  const crv = await mk("CRV", { control_account_id: acc["03.01.01.0001"], party_id: PA }, [["03.01.02.0001", 0, 100000]]);
  await submit(crv); await approve(crv);
  sameLines(await journal(crv), [["03.01.02.0001", 0, 100000], ["03.01.01.0001", 100000, 0]]) ? ok("CRV cash receipt: customer's receivable credited, cash debited") : bad("CRV journal");

  const bpv = await mk("BPV", { bank_account_id: B1.id, control_account_id: B1.gl_account_id, party_id: PS, instrument_type: "cheque", instrument_no: "CHQ-77", instrument_bank: "Meezan Bank Limited" }, [["02.01.01.0001", 250000, 0]]);
  await submit(bpv); await approve(bpv);
  const bj = await journal(bpv);
  sameLines(bj, [["02.01.01.0001", 250000, 0], ["03.01.01.0002", 0, 250000]]) && bj[0].party_id === PS && bj[1].party_id === PS
    ? ok("BPV bank payment: supplier debited, the bank account credited, party carried on both lines") : bad("BPV journal", JSON.stringify(bj));
  (await q(`select memo from journal_lines where entry_id = (select id from journal_entries where source_id='${bpv}') and credit > 0`)).rows[0].memo === "cheque CHQ-77"
    ? ok("the bank line records the instrument (cheque CHQ-77)") : bad("instrument memo");

  const brv = await mk("BRV", { bank_account_id: B2.id, control_account_id: B2.gl_account_id, party_id: PA, instrument_type: "cheque", instrument_no: "UBL-11", instrument_bank: "United Bank Limited" }, [["03.01.02.0001", 0, 400000]]);
  await submit(brv); await approve(brv);
  sameLines(await journal(brv), [["03.01.02.0001", 0, 400000], ["03.01.01.0003", 400000, 0]]) ? ok("BRV bank receipt: customer credited, the bank account debited") : bad("BRV journal");

  const jv = await mk("JV", { description: "Accrue marketing" }, [["05.02.03.0001", 10000, 0], ["02.01.01.0003", 0, 10000]]);
  await submit(jv); await approve(jv);
  sameLines(await journal(jv), [["05.02.03.0001", 10000, 0], ["02.01.01.0003", 0, 10000]]) ? ok("JV journal: debit section and credit section post as entered, no control line") : bad("JV journal");

  const cv = await mk("CV", { control_account_id: acc["03.01.01.0001"], description: "Cash deposited to bank" }, [["03.01.01.0002", 75000, 0]]);
  await submit(cv); await approve(cv);
  sameLines(await journal(cv), [["03.01.01.0002", 75000, 0], ["03.01.01.0001", 0, 75000]]) ? ok("CV contra: cash to bank, the from-account credited") : bad("CV journal");

  const sv = await mk("SV", { party_id: PA, control_account_id: acc["03.01.02.0001"], due_date: "2026-11-19", reference: "Plot A-12" }, [["04.01.01.0001", 0, 1000000], ["02.01.03.0001", 0, 160000]]);
  await submit(sv); await approve(sv);
  const sj = await journal(sv);
  sameLines(sj, [["04.01.01.0001", 0, 1000000], ["02.01.03.0001", 0, 160000], ["03.01.02.0001", 1160000, 0]]) && sj[2].party_id === PA
    ? ok("SV sales voucher: income + sales tax credited, the customer's receivable debited 1,160,000") : bad("SV journal", JSON.stringify(sj));

  const piv = await mk("PIV", { party_id: PS, control_account_id: acc["02.01.01.0001"], invoice_no: "INV-5521", due_date: "2026-11-30" }, [["05.01.01.0002", 800000, 0], ["03.01.05.0001", 128000, 0]]);
  await submit(piv); await approve(piv);
  const pj = await journal(piv);
  sameLines(pj, [["05.01.01.0002", 800000, 0], ["03.01.05.0001", 128000, 0], ["02.01.01.0001", 0, 928000]]) && pj[2].party_id === PS
    ? ok("PIV purchase invoice: cost + input tax debited, the supplier's payable credited 928,000") : bad("PIV journal", JSON.stringify(pj));

  const cn = await mk("CN", { party_id: PA, control_account_id: acc["03.01.02.0001"] }, [["04.01.01.0002", 50000, 0]]);
  await submit(cn); await approve(cn);
  sameLines(await journal(cn), [["04.01.01.0002", 50000, 0], ["03.01.02.0001", 0, 50000]]) ? ok("CN credit note: sales return debited, the customer's receivable credited") : bad("CN journal");

  const dn = await mk("DN", { party_id: PS, control_account_id: acc["02.01.01.0001"] }, [["05.01.01.0004", 0, 20000]]);
  await submit(dn); await approve(dn);
  sameLines(await journal(dn), [["05.01.01.0004", 0, 20000], ["02.01.01.0001", 20000, 0]]) ? ok("DN debit note: purchase return credited, the supplier's payable debited") : bad("DN journal");

  const tb = (await db.query(`select coalesce(sum(debit_total),0)::float d, coalesce(sum(credit_total),0)::float c from account_balances where company_id='${CO}'`)).rows[0];
  tb.d === tb.c && tb.d > 0 ? ok(`the books balance after all 10 voucher types (debits = credits = ${tb.d.toLocaleString()})`) : bad("trial balance", tb);

  // ───────── validation: a bad voucher cannot be submitted ─────────
  const refuse = (name, id, msg, perms) => expectError(name, () => submit(id, perms), msg);
  await refuse("a cash payment cannot carry a credit line", await mk("CPV", { control_account_id: acc["03.01.01.0001"] }, [["05.02.02.0001", 0, 100]]), "takes debit lines only");
  await refuse("a receipt cannot carry a debit line", await mk("CRV", { control_account_id: acc["03.01.01.0001"] }, [["03.01.02.0002", 100, 0]]), "takes credit lines only");
  await refuse("an unbalanced journal is refused", await mk("JV", {}, [["05.02.03.0001", 100, 0], ["02.01.01.0003", 0, 90]]), "must be equal");
  await refuse("a journal needs an amount", await mk("JV", {}, [["05.02.03.0001", 0, 0], ["02.01.01.0003", 0, 0]]), "either a debit or a credit");
  await refuse("a voucher with no lines is refused", await mk("CPV", { control_account_id: acc["03.01.01.0001"] }, []), "at least one line");
  await refuse("a cash payment must name its cash account", await mk("CPV", {}, [["05.02.02.0001", 100, 0]]), "Choose the cash account");
  await refuse("a cash voucher cannot use a bank account", await mk("CPV", { control_account_id: B1.gl_account_id }, [["05.02.02.0001", 100, 0]]), "must use a cash account");
  await refuse("a bank payment must name its bank account", await mk("BPV", { control_account_id: B1.gl_account_id }, [["05.02.02.0001", 100, 0]]), "Choose the bank account");
  await refuse("a bank account that does not match the voucher's account is refused", await mk("BPV", { bank_account_id: B1.id, control_account_id: B2.gl_account_id }, [["05.02.02.0001", 100, 0]]), "does not match");
  await refuse("a cheque needs its number", await mk("BPV", { bank_account_id: B1.id, control_account_id: B1.gl_account_id, instrument_type: "cheque" }, [["05.02.02.0001", 100, 0]]), "cheque number");
  await refuse("a line on a customer receivable needs the customer", await mk("CRV", { control_account_id: acc["03.01.01.0001"] }, [["03.01.02.0001", 0, 100]]), "needs a customer / supplier");
  await refuse("a heading account cannot be posted to", await mk("CPV", { control_account_id: acc["03.01.01.0001"] }, [["05.02", 100, 0]]), "heading");
  await refuse("a contra voucher cannot move money to the same account", await mk("CV", { control_account_id: acc["03.01.01.0001"] }, [["03.01.01.0001", 100, 0]]), "two different");
  await refuse("a contra voucher only moves between cash and bank", await mk("CV", { control_account_id: acc["03.01.01.0001"] }, [["05.02.02.0001", 100, 0]]), "cash and bank");
  await refuse("a sales voucher needs its customer", await mk("SV", { control_account_id: acc["03.01.02.0001"] }, [["04.01.01.0001", 0, 100]]), "Choose the customer");
  await refuse("a purchase voucher uses a payable account", await mk("PIV", { party_id: PS, control_account_id: acc["03.01.02.0001"] }, [["05.01.01.0002", 100, 0]]), "uses a payable account");

  // ───────── draft, submit, take back, reject: editing rules ─────────
  const d = await mk("CPV", { control_account_id: acc["03.01.01.0001"], description: "draft" }, [["05.02.02.0001", 500, 0]]);
  await q(`update vouchers set description='edited draft' where id='${d}'`).then(() => ok("a draft can be edited freely"), (e) => bad("draft edit", e));
  await submit(d);
  await expectError("a submitted voucher's lines cannot be changed", () => q(`update voucher_lines set debit = 999 where voucher_id='${d}'`), "cannot be changed");
  await expectError("a submitted voucher's details cannot be changed", () => q(`update vouchers set description='sneaky' where id='${d}'`), "cannot be edited");
  await q(`update vouchers set status='draft' where id='${d}'`).then(() => ok("a submitted voucher can be taken back to draft"), (e) => bad("take back", e));
  await q(`update voucher_lines set debit = 600 where voucher_id='${d}'`).then(() => ok("...and edited again"), (e) => bad("edit after take back", e));
  await expectError("a voucher's type cannot be changed", () => q(`update vouchers set voucher_type='CRV' where id='${d}'`), "type and number");
  await expectError("a draft cannot be approved without being submitted", () => approve(d), "submitted can be approved");
  await submit(d);
  await q(`update vouchers set status='rejected', approval_note='wrong account' where id='${d}'`).then(() => ok("a submitted voucher can be rejected with a note"), (e) => bad("reject", e));
  await q(`update voucher_lines set debit = 700 where voucher_id='${d}'`).then(() => ok("a rejected voucher can be corrected"), (e) => bad("edit rejected", e));
  await expectError("an approved voucher cannot be edited", () => q(`update vouchers set description='x' where id='${cpv}'`), "cannot be edited");
  await expectError("an approved voucher's lines cannot be changed", () => q(`update voucher_lines set debit = 1 where voucher_id='${cpv}'`), "cannot be changed");

  // ───────── who may approve ─────────
  const p1 = await mk("CPV", { control_account_id: acc["03.01.01.0001"] }, [["05.02.02.0001", 1000, 0]]);
  await submit(p1);
  await expectError("approving needs the accounts.approve permission", () => approve(p1, U, "accounts.create,accounts.edit"), "accounts.approve");
  await approve(p1, U, "accounts.approve").then(() => ok("a person with accounts.approve can approve"), (e) => bad("approve with permission", e));
  await db.exec(`update companies set settings = settings || '{"voucher_self_approval": false}' where id='${CO}'`);
  const p2 = await mk("CPV", { control_account_id: acc["03.01.01.0001"] }, [["05.02.02.0001", 1000, 0]]);
  await submit(p2);
  await expectError("with self-approval switched off, the preparer cannot approve their own voucher", () => approve(p2, U), "cannot approve it");
  await approve(p2, U2).then(() => ok("...but a second person can"), (e) => bad("second approver", e));
  await db.exec(`update companies set settings = settings || '{"voucher_self_approval": true}' where id='${CO}'`);

  // ───────── periods ─────────
  await q(`select app.ensure_period('${CO}', '2025-08-15')`);
  await db.exec(`update accounting_periods set status='locked' where company_id='${CO}' and start_date='2025-08-01'`);
  const old = await mk("CPV", { control_account_id: acc["03.01.01.0001"], voucher_date: "2025-08-15" }, [["05.02.02.0001", 1000, 0]]);
  await submit(old);
  await expectError("a voucher dated in a locked period cannot be approved", () => approve(old), "locked");
  await db.exec(`update accounting_periods set status='open' where company_id='${CO}' and start_date='2025-08-01'`);
  await approve(old).then(() => ok("...and can once the period is open"), (e) => bad("approve after unlock", e));
  const future = await mk("CPV", { control_account_id: acc["03.01.01.0001"], voucher_date: "2031-01-05" }, [["05.02.02.0001", 1000, 0]]);
  await submit(future); await approve(future);
  (await db.query(`select count(*)::int n from fiscal_years where company_id='${CO}' and name='FY2031'`)).rows[0].n === 1
    ? ok("a voucher in a year with no periods yet creates its financial year on approval (FY2031)") : bad("auto fiscal year");

  // ───────── voiding ─────────
  const cashBefore = (await db.query(`select coalesce(sum(debit_total - credit_total),0)::float b from account_balances where company_id='${CO}' and account_id='${acc["03.01.01.0001"]}'`)).rows[0].b;
  await expectError("voiding needs a reason", () => q(`select app.void_voucher('${cpv}','${U}','  ','2026-10-20')`), "reason is required");
  await q(`select app.void_voucher('${cpv}','${U}','Posted to the wrong month','2026-10-20')`).then(() => ok("an approved voucher can be voided with a reason"), (e) => bad("void", e));
  const after = (await db.query(`select coalesce(sum(debit_total - credit_total),0)::float b from account_balances where company_id='${CO}' and account_id='${acc["03.01.01.0001"]}'`)).rows[0].b;
  after - cashBefore === 60000 && (await status(cpv)) === "void" ? ok("voiding reverses the entry: cash is back by 60,000 and the voucher is void") : bad("void effect", { cashBefore, after });
  (await q(`select count(*)::int n from journal_entries where source_id='${cpv}' and reversal_of is not null`)).rows[0].n === 1 ? ok("the reversal is a new entry; the original stays on record") : bad("reversal entry");
  await expectError("a voucher cannot be voided twice", () => q(`select app.void_voucher('${cpv}','${U}','again','2026-10-20')`), "approved voucher can be voided");
  await q(`update vouchers set status='void' where id='${d}'`).then(() => ok("a draft can simply be discarded"), (e) => bad("discard draft", e));

  // ───────── lists, numbering, isolation ─────────
  const list = (await q(`select voucher_type, total_amount::float t, party_name, bank_name, line_count from v_vouchers where id in ('${sv}','${bpv}','${jv}','${cv}')`)).rows;
  const byType = Object.fromEntries(list.map((r) => [r.voucher_type, r]));
  byType.SV.t === 1160000 && byType.SV.party_name === "Customer A" && byType.BPV.t === 250000 && byType.BPV.bank_name === "Habib Bank Limited" && byType.JV.t === 10000 && byType.CV.t === 75000
    ? ok("the voucher list shows totals, the party and the bank") : bad("v_vouchers", JSON.stringify(byType));
  const nos = (await q(`select number from vouchers where voucher_type='CPV' order by number`)).rows.map((r) => r.number);
  nos[0] === "CPV-00001" && nos[1] === "CPV-00002" && new Set(nos).size === nos.length ? ok("voucher numbers run in sequence per type (CPV-00001, CPV-00002, ...)") : bad("numbering", nos.slice(0, 4).join());
  (await asCompany(C2, () => db.query(`select count(*)::int n from v_vouchers`))).rows[0].n === 0 ? ok("another company sees none of these vouchers through the list view") : bad("v_vouchers isolation");
  await expectError("another company cannot approve this company's voucher", () => asCompany(C2, () => db.exec(`select app.approve_voucher('${p1}','${U}')`)), "not found");
  const views = (await db.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce('security_invoker=true' = any (c.reloptions), false)`)).rows[0].n;
  views === 0 ? ok("every view runs with the caller's rights (no view can bypass row-level security)") : bad("insecure views", views);
}

// ═════════════════════════════════════════════════ Migration 0005: bank reconciliation
console.log("\nBank reconciliation");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const U = "b1000000-0000-0000-0000-0000000000f9";
  const PA = "9a000000-0000-0000-0000-0000000000a1";
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const x = (sql) => asCompany(CO, () => db.exec(sql));
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const [B1, B2] = (await db.query(`select id, gl_account_id from bank_accounts where company_id='${CO}' order by created_at`)).rows;

  // small helper: a voucher into/out of bank account B1, submitted and approved
  const bankVoucher = async (type, amount, date, accountCode, extra = {}) => {
    const no = (await q(`select app.next_doc_no('${CO}','${type}') n`)).rows[0].n;
    const id = crypto.randomUUID();
    const cols = { id, company_id: CO, voucher_type: type, number: no, voucher_date: date, created_by: U, bank_account_id: B1.id, control_account_id: B1.gl_account_id, instrument_type: "cheque", party_id: PA, ...extra };
    await x(`insert into vouchers(${Object.keys(cols).join(",")}) values (${Object.values(cols).map((v) => (v === null ? "null" : `'${v}'`)).join(",")})`);
    await x(`insert into voucher_lines(company_id,voucher_id,line_no,account_id,debit,credit) values ('${CO}','${id}',1,'${acc[accountCode]}',${type === "BPV" ? amount : 0},${type === "BRV" ? amount : 0})`);
    await x(`update vouchers set status='pending' where id='${id}'`);
    await q(`select app.approve_voucher('${id}','${U}')`);
    return id;
  };
  const ledger = async () => (await q(`select amount::float a, cleared, to_char(entry_date,'MM-DD') d, description from v_bank_ledger where bank_account_id='${B1.id}' order by entry_date, entry_no`)).rows;

  // the books already hold: contra deposit +75,000 (10-19) and cheque CHQ-77 -250,000 (10-19). Add the rest of October:
  const brv = await bankVoucher("BRV", 500000, "2026-10-10", "03.01.02.0001", { instrument_no: "UBL-90" });
  const wrong = await bankVoucher("BRV", 5000, "2026-10-15", "03.01.02.0001", { instrument_no: "UBL-91" });       // later voided: bounced cheque
  await q(`select app.void_voucher('${wrong}','${U}','cheque bounced','2026-10-16')`);
  const book = (await ledger()).reduce((t, r) => t + r.a, 0);
  book === 325000 ? ok("the bank ledger holds +500,000 +75,000 -250,000 (a voided 5,000 receipt nets to zero) = 325,000") : bad("ledger setup", book);

  // ───────── the statement ─────────
  const badStmt = (await q(`insert into bank_statements(company_id,bank_account_id,label,period_from,period_to,opening_balance,closing_balance,created_by)
      values ('${CO}','${B1.id}','Wrong October','2026-10-01','2026-10-31',0,999,'${U}') returning id`)).rows[0].id;
  await x(`insert into bank_statement_lines(company_id,statement_id,line_no,txn_date,description,deposit,withdrawal) values ('${CO}','${badStmt}',1,'2026-10-12','DEPOSIT',500000,0)`);
  await expectError("a statement whose lines do not add up to its closing balance is refused", () => q(`select app.start_reconciliation('${B1.id}','${badStmt}','2026-10-31',999,'${U}')`), "do not add up");
  await x(`delete from bank_statement_lines where statement_id='${badStmt}'; delete from bank_statements where id='${badStmt}'`);

  const stmt = (await q(`insert into bank_statements(company_id,bank_account_id,label,period_from,period_to,opening_balance,closing_balance,created_by)
      values ('${CO}','${B1.id}','October 2026','2026-10-01','2026-10-31',0,323500,'${U}') returning id`)).rows[0].id;
  const L = {};
  for (const [n, date, desc, ref, dep, wd] of [[1, "2026-10-12", "CHEQUE DEPOSIT", "UBL-90", 500000, 0], [2, "2026-10-20", "CASH DEPOSIT", null, 75000, 0],
                                              [3, "2026-10-27", "CHEQUE 77 CLEARED", "CHQ-77", 0, 250000], [4, "2026-10-31", "SERVICE CHARGES", null, 0, 1500]]) {
    L[n] = (await q(`insert into bank_statement_lines(company_id,statement_id,line_no,txn_date,description,reference,deposit,withdrawal)
        values ('${CO}','${stmt}',${n},'${date}','${desc}',${ref ? `'${ref}'` : "null"},${dep},${wd}) returning id`)).rows[0].id;
  }
  await expectError("a statement line is a deposit or a withdrawal, not both or neither", () => x(`insert into bank_statement_lines(company_id,statement_id,line_no,txn_date,deposit,withdrawal) values ('${CO}','${stmt}',9,'2026-10-01',5,5)`), "check");

  // ───────── suggestions and matching ─────────
  const sug = (await q(`select statement_line_id sl, journal_line_id jl, score, reason from app.suggest_matches('${stmt}') order by score desc`)).rows;
  const bySl = Object.fromEntries(sug.map((s) => [s.sl, s]));
  sug.length === 3 && bySl[L[1]] && bySl[L[2]] && bySl[L[3]] && !bySl[L[4]]
    ? ok("the system suggests 3 matches (deposit, cash deposit, cheque 77) and none for the bank charge") : bad("suggestions", JSON.stringify(sug));
  bySl[L[1]].reason === "same amount and reference" && bySl[L[3]].reason === "same amount and reference" && bySl[L[1]].score > bySl[L[2]].score
    ? ok("a matching cheque / reference ranks higher than amount alone") : bad("suggestion ranking", JSON.stringify(sug));

  await expectError("a statement line cannot be matched to an entry of a different amount", () => q(`select app.match_statement_line('${L[4]}', array['${bySl[L[1]].jl}']::uuid[], '${U}')`), "do not agree");
  for (const n of [1, 2, 3]) await q(`select app.match_statement_line('${L[n]}', array['${bySl[L[n]].jl}']::uuid[], '${U}')`);
  const st = Object.fromEntries((await q(`select line_no, match_status, matched_amount::float m from v_bank_statement_lines where statement_id='${stmt}'`)).rows.map((r) => [r.line_no, r]));
  st[1].match_status === "matched" && st[3].match_status === "matched" && st[4].match_status === "unmatched" && st[3].m === -250000
    ? ok("matched lines show as matched; the bank charge is still unmatched") : bad("match status", JSON.stringify(st));
  await expectError("a matched statement line cannot be matched twice", () => q(`select app.match_statement_line('${L[1]}', array['${bySl[L[1]].jl}']::uuid[], '${U}')`), "already matched");
  await expectError("a matched statement line cannot be edited until un-matched", () => x(`update bank_statement_lines set description='x' where id='${L[1]}'`), "un-match it first");

  // ───────── the books are missing the bank's charge: the reconciliation does not balance ─────────
  const r0 = (await q(`select * from app.reconciliation_report('${B1.id}','2026-10-31',323500)`)).rows[0];
  Number(r0.book_balance) === 325000 && Number(r0.cleared_balance) === 325000 && Number(r0.difference) === -1500
    ? ok("report: the statement is 1,500 short of the books (the unrecorded bank charge)") : bad("report before charge", JSON.stringify(r0));
  const rec = (await q(`select app.start_reconciliation('${B1.id}','${stmt}','2026-10-31',323500,'${U}') id`)).rows[0].id;
  const pair = (await ledger()).filter((r) => Math.abs(r.a) === 5000);
  pair.length === 2 && pair.every((r) => r.cleared) ? ok("a voided receipt and its reversal are cleared as a pair automatically") : bad("auto pair", JSON.stringify(pair));
  await expectError("a reconciliation that does not balance cannot be finished", () => q(`select app.finalize_reconciliation('${rec}','${U}')`), "does not balance");
  await expectError("only one reconciliation can be open for a bank account", () => q(`select app.start_reconciliation('${B1.id}',null,'2026-11-30',0,'${U}')`), "bank_recon_one_draft");

  // ───────── book the charge straight from the statement line ─────────
  const dv = (await q(`select app.draft_voucher_from_statement_line('${L[4]}','${acc["05.02.05.0001"]}','${U}') id`)).rows[0].id;
  const dvr = (await q(`select voucher_type, status, voucher_date::text d, bank_account_id, control_account_id, statement_line_id from vouchers where id='${dv}'`)).rows[0];
  dvr.voucher_type === "BPV" && dvr.status === "draft" && dvr.d === "2026-10-31" && dvr.bank_account_id === B1.id && dvr.statement_line_id === L[4]
    ? ok("an unmatched withdrawal becomes a draft Bank Payment Voucher on the right bank account and date") : bad("draft voucher", JSON.stringify(dvr));
  await expectError("a statement line can have only one voucher drafted for it", () => q(`select app.draft_voucher_from_statement_line('${L[4]}','${acc["05.02.05.0001"]}','${U}')`), "already been drafted");
  await x(`update vouchers set status='pending' where id='${dv}'`);
  await q(`select app.approve_voucher('${dv}','${U}')`);
  (await q(`select match_status from v_bank_statement_lines where id='${L[4]}'`)).rows[0].match_status === "matched"
    ? ok("approving that voucher matches the statement line automatically") : bad("auto match");

  // ───────── an outstanding cheque: booked, not yet on the statement ─────────
  await bankVoucher("BPV", 40000, "2026-10-28", "02.01.01.0001", { instrument_no: "CHQ-80", party_id: "9a000000-0000-0000-0000-0000000000a2" });
  const r1 = (await q(`select * from app.reconciliation_report('${B1.id}','2026-10-31',323500)`)).rows[0];
  Number(r1.outstanding_payments) === 40000 && Number(r1.deposits_in_transit) === 0 && Number(r1.adjusted_bank_balance) === 283500 && Number(r1.book_balance) === 283500 && Number(r1.difference) === 0
    ? ok("report: 323,500 statement - 40,000 outstanding cheque = 283,500 adjusted = 283,500 per books, difference 0") : bad("report with outstanding", JSON.stringify(r1));
  await q(`select app.finalize_reconciliation('${rec}','${U}')`).then(() => ok("the reconciliation is finished once the difference is zero (an outstanding cheque is fine)"), (e) => bad("finalize", e));
  const fin = (await q(`select status, difference::float d, finalized_by from bank_reconciliations where id='${rec}'`)).rows[0];
  fin.status === "finalized" && fin.d === 0 && fin.finalized_by === U ? ok("it records who finished it and that the difference was 0") : bad("finalized row", JSON.stringify(fin));
  const locked = (await q(`select count(*)::int n, count(*) filter (where reconciliation_id = '${rec}')::int l from bank_clearings where bank_account_id='${B1.id}'`)).rows[0];
  locked.n === locked.l && locked.n > 0 ? ok(`all ${locked.n} cleared entries are locked into the finished reconciliation`) : bad("locked clearings", JSON.stringify(locked));
  await expectError("a locked entry cannot be un-matched", () => q(`select app.unmatch_statement_line('${L[3]}')`), "finished reconciliation");
  await expectError("a locked entry cannot be un-cleared", () => q(`select app.unclear_ledger_line('${bySl[L[1]].jl}')`), "finished reconciliation");
  const outstanding = (await ledger()).filter((r) => !r.cleared);
  outstanding.length === 1 && outstanding[0].a === -40000 ? ok("only the 40,000 cheque is still outstanding for the next reconciliation") : bad("outstanding after", JSON.stringify(outstanding));

  // ───────── clearing by hand, and its rules ─────────
  const chq80 = (await q(`select journal_line_id jl from v_bank_ledger where bank_account_id='${B1.id}' and not cleared`)).rows[0].jl;
  await expectError("an entry cannot clear the bank before its own date", () => q(`select app.clear_ledger_line('${chq80}','2026-10-01','${U}')`), "before its own date");
  await q(`select app.clear_ledger_line('${chq80}','2026-11-03','${U}')`).then(() => ok("an outstanding cheque can be cleared by hand on the date the bank paid it"), (e) => bad("clear by hand", e));
  await expectError("an entry cannot be cleared twice", () => q(`select app.clear_ledger_line('${chq80}','2026-11-03','${U}')`), "already cleared");
  await q(`select app.unclear_ledger_line('${chq80}')`).then(() => ok("...and un-cleared again while it is not locked"), (e) => bad("unclear", e));
  const cashLine = (await q(`select l.id from journal_lines l join gl_accounts a on a.id = l.account_id where a.code='03.01.01.0001' limit 1`)).rows[0].id;
  await expectError("only entries on a bank account can be cleared", () => q(`select app.clear_ledger_line('${cashLine}','2026-11-03','${U}')`), "not on a bank account");

  // ───────── re-opening the latest reconciliation ─────────
  const next = (await q(`select app.start_reconciliation('${B1.id}',null,'2026-11-30',283500,'${U}') id`)).rows[0].id;
  await expectError("a finished reconciliation cannot be re-opened while another is open", () => q(`select app.reopen_reconciliation('${rec}','${U}')`), "open reconciliation");
  await x(`delete from bank_reconciliations where id='${next}'`);
  await q(`select app.reopen_reconciliation('${rec}','${U}')`).then(() => ok("the most recent reconciliation can be re-opened to correct a mistake"), (e) => bad("reopen", e));
  (await q(`select count(*)::int n from bank_clearings where reconciliation_id is not null`)).rows[0].n === 0 ? ok("re-opening unlocks its entries") : bad("unlock after reopen");
  await q(`select app.unmatch_statement_line('${L[3]}')`).then(() => ok("...so a match can now be undone"), (e) => bad("unmatch after reopen", e));
  await q(`select app.match_statement_line('${L[3]}', array['${bySl[L[3]].jl}']::uuid[], '${U}')`);
  await q(`select app.finalize_reconciliation('${rec}','${U}')`).then(() => ok("...and the reconciliation finished again"), (e) => bad("refinalize", e));

  // ───────── isolation and health ─────────
  const seen = (await asCompany(C2, () => db.query(`select (select count(*)::int from bank_statements) s, (select count(*)::int from bank_clearings) c, (select count(*)::int from v_bank_ledger) l, (select count(*)::int from v_bank_statement_lines) sl`))).rows[0];
  seen.s === 0 && seen.c === 0 && seen.l === 0 && seen.sl === 0 ? ok("another company sees none of the statements, clearings or bank ledger") : bad("recon isolation", JSON.stringify(seen));
  await expectError("another company cannot match this company's statement line", () => asCompany(C2, () => db.exec(`select app.match_statement_line('${L[1]}', array['${bySl[L[1]].jl}']::uuid[], '${U}')`)), "not found");
  const dirty = (await db.query(`select check_name, detail from v_reconciliation`)).rows;
  dirty.length === 0 ? ok("after all of this, every self-check of the books is still clean") : bad("books not clean", JSON.stringify(dirty.slice(0, 3)));
}

// ═════════════════════════════════════════════════ Migration 0006: ledger queries
console.log("\nLedger queries");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const PA = "9a000000-0000-0000-0000-0000000000a1", PS = "9a000000-0000-0000-0000-0000000000a2";
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const [B1] = (await db.query(`select id, gl_account_id from bank_accounts where company_id='${CO}' order by created_at`)).rows;

  // trial balance over everything this company posted
  const tbRows = (await q(`select * from app.trial_balance('2020-01-01','2040-12-31')`)).rows;
  const sum = (k) => tbRows.reduce((t, r) => t + Number(r[k]), 0);
  Math.abs(sum("debit") - sum("credit")) < 0.005 && sum("debit") > 0 && Math.abs(sum("closing")) < 0.005
    ? ok(`the trial balance balances: debits = credits = ${sum("debit").toLocaleString()}, closing balances net to zero`) : bad("trial balance", { d: sum("debit"), c: sum("credit"), cl: sum("closing") });
  tbRows.every((r) => !String(r.code).endsWith(".")) && tbRows.length >= 45 ? ok("it lists every posting account (headings are rolled up by code prefix, not listed)") : bad("tb accounts", tbRows.length);

  // the same company, split at a date: opening + movement = closing
  const split = (await q(`select * from app.trial_balance('2026-10-15','2026-10-31')`)).rows.find((r) => r.code === "03.01.01.0002");
  Number(split.opening) + Number(split.debit) - Number(split.credit) === Number(split.closing)
    ? ok("for any account, opening + debits - credits = closing") : bad("opening/closing identity", JSON.stringify(split));

  // an account ledger with a running balance
  const led = (await q(`select * from app.account_ledger('${B1.gl_account_id}','2026-10-01','2026-12-31')`)).rows;
  const last = led[led.length - 1];
  Number(last.running_balance) === 283500 ? ok("the bank account's ledger ends on its true balance (283,500)") : bad("running balance", last && last.running_balance);
  led.every((r, i) => i === 0 || r.entry_date >= led[i - 1].entry_date) ? ok("entries come out in date order") : bad("ledger order");
  const open = Number((await q(`select app.account_opening('${B1.gl_account_id}','2026-10-20') o`)).rows[0].o);
  const ledLate = (await q(`select * from app.account_ledger('${B1.gl_account_id}','2026-10-20','2026-12-31')`)).rows;
  Number(ledLate[ledLate.length - 1].running_balance) === 283500 && open !== 0
    ? ok("starting the ledger later carries the earlier balance forward") : bad("opening carry", { open, last: ledLate[ledLate.length - 1] });

  // a customer's statement: what they owe us
  const pa = (await q(`select * from app.party_ledger('${PA}','2020-01-01','2040-12-31')`)).rows;
  Number(pa[pa.length - 1].running_balance) === 110000
    ? ok("Customer A's statement: invoiced 1,160,000, paid 1,050,000 (cash, two bank receipts), credit note... = owes 110,000") : bad("customer statement", pa.map((r) => [r.entry_no, r.debit, r.credit, r.running_balance].join(":")).join(" | "));
  pa.some((r) => r.source_type === "voucher") && pa.every((r) => ["03.01.02.0001"].includes(r.account_code))
    ? ok("every statement line is a receivable entry traced to its voucher") : bad("statement lines");
  const ps = (await q(`select * from app.party_ledger('${PS}','2020-01-01','2040-12-31')`)).rows;
  Number(ps[ps.length - 1].running_balance) === -(928000 - 250000 - 40000 - 20000)
    ? ok("Supplier S's statement: invoiced 928,000 less payments and a debit note = we owe 618,000 (shown as a negative balance)") : bad("supplier statement", ps.map((r) => r.running_balance).join(","));

  // isolation
  const other = (await asCompany(C2, () => db.query(`select count(*)::int n from app.account_ledger('${B1.gl_account_id}','2020-01-01','2040-12-31')`))).rows[0].n;
  const otherTb = (await asCompany(C2, () => db.query(`select count(*)::int n from app.trial_balance('2020-01-01','2040-12-31') where account_id in (select id from gl_accounts where company_id = '${CO}')`))).rows[0].n;
  other === 0 && otherTb === 0 ? ok("another company sees none of this company's ledger or accounts in its trial balance") : bad("report isolation", { other, otherTb });
}

console.log("\nCustomer receipts");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const U = "b1000000-0000-0000-0000-0000000000f9";
  const PA = "9a000000-0000-0000-0000-0000000000a1";
  const PRJ = "c0000000-0000-0000-0000-0000000000d3", TY = "70000000-0000-0000-0000-0000000000d3";
  const PR = (n) => `d7000000-0000-0000-0000-00000000000${n}`;
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const [B1] = (await db.query(`select id, gl_account_id from bank_accounts where company_id='${CO}' order by created_at`)).rows;
  await asCompany(CO, () => db.exec(`
    insert into projects(id,company_id,code,name,type) values ('${PRJ}','${CO}','PRJ-R1','Receipts Valley','residential');
    insert into property_types(id,company_id,code,name,property_group) values ('${TY}','${CO}','plot','Plot','residential');
    insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
      ('${PR(1)}','${CO}','${PRJ}','${TY}','PRP-R001','Plot R1',1000000), ('${PR(2)}','${CO}','${PRJ}','${TY}','PRP-R002','Plot R2',500000)`));
  const BK = (await q(`select app.create_booking('${PR(1)}','${PA}','installment','${U}') id`)).rows[0].id;
  await q(`select app.build_schedule('${BK}', 200000, 4, '2026-11-01')`);   // 200,000 down + 4 x 200,000
  const rec = async (amount, extra = "null, null") => (await q(`select app.record_receipt('${BK}', ${amount}, 'cheque', '${acc["03.01.01.0001"]}', '2026-10-20', 'CHQ-77', '${U}', ${extra}) id`)).rows[0].id;

  const R1 = await rec(300000);
  const r1 = (await q(`select receipt_no, status, journal_entry_id from receipts where id='${R1}'`)).rows[0];
  r1.receipt_no.startsWith("RCT-") && r1.status === "posted" && r1.journal_entry_id ? ok("a receipt is numbered (RCT-…), posted and linked to its ledger entry") : bad("receipt header", JSON.stringify(r1));
  const j = (await q(`select a.code, l.debit::float d, l.credit::float c, l.party_id from journal_lines l join gl_accounts a on a.id = l.account_id where entry_id = '${r1.journal_entry_id}' order by l.line_no`)).rows;
  j.length === 2 && j[0].code === "03.01.01.0001" && j[0].d === 300000 && j[1].code === "02.01.02.0001" && j[1].c === 300000 && j.every((x) => x.party_id === PA)
    ? ok("it debits the cash account and credits Customer Advances, both for the customer") : bad("receipt entry", JSON.stringify(j));
  const inst = (await q(`select seq, paid_amount::float p, status from installments where booking_id='${BK}' order by seq`)).rows;
  inst[0].status === "paid" && inst[1].p === 100000 && inst[1].status === "partial" && inst[2].p === 0
    ? ok("300,000 settles the down payment and half of installment 1 (oldest first)") : bad("auto allocation", JSON.stringify(inst));

  const i3 = (await q(`select id from installments where booking_id='${BK}' and seq=3`)).rows[0].id;
  await expectError("an installment cannot be over-paid by a chosen allocation", () => q(`select app.record_receipt('${BK}', 500000, 'cash', '${acc["03.01.01.0001"]}', '2026-10-21', null, '${U}',
    '[{"installmentId":"${i3}","amount":250000}]'::jsonb)`), "left to pay");
  const i4 = (await q(`select id from installments where booking_id='${BK}' and seq=4`)).rows[0].id;
  const R2 = await rec(150000, `'[{"installmentId":"${i4}","amount":150000}]'::jsonb, null`);
  const i4row = (await q(`select paid_amount::float p, status from installments where id='${i4}'`)).rows[0];
  i4row.p === 150000 && i4row.status === "partial" ? ok("a chosen allocation pays exactly the installment the person picked") : bad("chosen allocation", JSON.stringify(i4row));

  await expectError("money cannot be received into an expense account", () => q(`select app.record_receipt('${BK}', 1000, 'cash', '${acc["05.02.02.0001"]}', '2026-10-20', null, '${U}')`), "cash or bank");
  await expectError("a zero receipt is refused", () => q(`select app.record_receipt('${BK}', 0, 'cash', '${acc["03.01.01.0001"]}', '2026-10-20', null, '${U}')`), "more than zero");

  // an advance with no installment left to pay stays as an advance
  const R3 = await rec(10000000);
  const alloc = (await q(`select coalesce(sum(amount),0)::float s from receipt_allocations where receipt_id='${R3}'`)).rows[0].s;
  alloc === 550000 ? ok("an overpayment settles what is due and the rest stays on the customer as an advance") : bad("overpayment", alloc);
  const vr = (await q(`select allocated_amount::float a, amount::float m, customer_name, booking_no from v_receipts where id='${R3}'`)).rows[0];
  vr.m === 10000000 && vr.a < vr.m && vr.customer_name === "Customer A" ? ok("the receipts list shows customer, booking and how much is applied") : bad("v_receipts", JSON.stringify(vr));

  // voiding reverses the ledger entry and the allocations
  await q(`select set_config('app.permissions','accounts.approve', true)`);
  await asCompany(CO, async () => { await db.exec(`select set_config('app.permissions','accounts.approve', true)`); await db.exec(`select app.void_receipt('${R2}','${U}','Entered twice')`); });
  const i4after = (await q(`select paid_amount::float p, status from installments where id='${i4}'`)).rows[0];
  const adv = (await q(`select coalesce(sum(l.credit - l.debit),0)::float b from journal_lines l join gl_accounts a on a.id = l.account_id where a.code = '02.01.02.0001' and l.party_id = '${PA}'`)).rows[0].b;
  i4after.p === 50000 && i4after.status === "partial" ? ok("voiding a receipt gives its share of the installment back (only the later overpayment's 50,000 remains)") : bad("void allocation", JSON.stringify(i4after));
  adv === 300000 + 10000000 ? ok("and removes it from the customer's advance balance in the ledger") : bad("void ledger", adv);

  // cancelled booking
  await q(`update bookings set status='cancelled', cancelled_at=now(), cancel_reason='test' where id='${BK}'`).catch(() => {});
  await expectError("no money can be received against a cancelled booking", () => q(`select app.record_receipt('${BK}', 1000, 'cash', '${acc["03.01.01.0001"]}', '2026-10-20', null, '${U}')`), "cancelled");
}

console.log("\nAdministration, CRM, cheques, service invoices, contracts");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const ORG = "00000000-0000-0000-0000-0000000000a1";
  const U = "b1000000-0000-0000-0000-0000000000f9";
  const PA = "9a000000-0000-0000-0000-0000000000a1";
  const PRJ = "c0000000-0000-0000-0000-0000000000d3", TY = "70000000-0000-0000-0000-0000000000d3";
  const PR = (n) => `d8000000-0000-0000-0000-00000000000${n}`;
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const [B1] = (await db.query(`select id, gl_account_id from bank_accounts where company_id='${CO}' order by created_at`)).rows;

  // — plan and standard accounts —
  (await db.query(`select app.company_plan('${CO}') p`)).rows[0].p === "basic" ? ok("a company's plan is read from its organization") : bad("company_plan");
  await db.exec(`select app.seed_extra_accounts('${CO}')`);
  (await db.query(`select count(*)::int n from gl_accounts where company_id='${CO}' and code in ('02.01.01.0004','02.01.01.0005','02.01.01.0006')`)).rows[0].n === 3
    ? ok("the salary, retention and contractor payable accounts can be added to any company (and are idempotent)") : bad("extra accounts");
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;

  // — inviting a colleague —
  const ROLE = "e1000000-0000-0000-0000-0000000000d8";
  await db.exec(`insert into roles(id, org_id, name) values ('${ROLE}', '${ORG}', 'Sales Agent Test')`);
  await q(`insert into company_invites(company_id, email, role_id, invited_by) values ('${CO}', 'new.agent@x.pk', '${ROLE}', '${U}')`);
  await expectError("the same email cannot be invited twice at once", () => q(`insert into company_invites(company_id, email, role_id) values ('${CO}', 'new.agent@x.pk', '${ROLE}')`), "company_invites_pending_uq");
  await expectError("an invite email must be lower-case and well formed", () => q(`insert into company_invites(company_id, email, role_id) values ('${CO}', 'Bad Email', '${ROLE}')`));
  const NU = "b1000000-0000-0000-0000-0000000000d8";
  await db.exec(`insert into users(id,email,full_name) values ('${NU}','new.agent@x.pk','New Agent')`);
  const joined = (await db.query(`select app.accept_invites('${NU}', 'New.Agent@X.pk') n`)).rows[0].n;
  const mem = (await db.query(`select count(*)::int n from company_members where company_id='${CO}' and user_id='${NU}' and role_id='${ROLE}' and status='active'`)).rows[0].n;
  joined === 1 && mem === 1 ? ok("signing in with an invited email (any letter case) joins the company with the invited role") : bad("accept_invites", { joined, mem });
  (await db.query(`select app.accept_invites('${NU}', 'new.agent@x.pk') n`)).rows[0].n === 0 ? ok("an invite is used only once") : bad("invite reuse");

  // — leads —
  const L1 = (await q(`insert into leads(company_id, lead_no, name, phone, city, source, created_by) values ('${CO}', app.next_doc_no('${CO}','LEAD'), 'Kamran Ali', '+923001112233', 'Lahore', 'walk_in', '${U}') returning id`)).rows[0].id;
  await expectError("a lead cannot be marked lost without a reason", () => q(`update leads set stage='lost' where id='${L1}'`));
  await expectError("a budget range must run low to high", () => q(`update leads set budget_min = 5000000, budget_max = 1000000 where id='${L1}'`));
  const cust = (await q(`select app.convert_lead('${L1}', '${U}') p`)).rows[0].p;
  const lead = (await q(`select stage, party_id from leads where id='${L1}'`)).rows[0];
  const role = (await q(`select count(*)::int n from party_roles where party_id='${cust}' and role='customer'`)).rows[0].n;
  lead.stage === "won" && lead.party_id === cust && role === 1 ? ok("converting a lead creates a customer in the address book and marks the lead won") : bad("convert_lead", JSON.stringify({ lead, role }));
  (await q(`select app.convert_lead('${L1}', '${U}') p`)).rows[0].p === cust ? ok("converting twice returns the same customer") : bad("convert twice");
  (await asCompany("00000000-0000-0000-0000-0000000000d4", () => db.query(`select count(*)::int n from leads`))).rows[0].n === 0 ? ok("another company cannot see these leads") : bad("lead isolation");

  // — quotation → booking —
  await q(`insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
    ('${PR(1)}','${CO}','${PRJ}','${TY}','PRP-Q001','Plot Q1',2000000), ('${PR(2)}','${CO}','${PRJ}','${TY}','PRP-Q002','Plot Q2',1000000)`);
  await expectError("a quotation needs a lead or a customer", () => q(`insert into quotations(company_id, quote_no, property_id, valid_until, list_price) values ('${CO}','Q-X','${PR(1)}', current_date + 7, 100)`));
  await expectError("a quotation's down payment cannot exceed its price", () => q(`insert into quotations(company_id, quote_no, party_id, property_id, valid_until, list_price, down_payment) values ('${CO}','Q-Y','${PA}','${PR(1)}', current_date + 7, 100, 200)`));
  const L2 = (await q(`insert into leads(company_id, lead_no, name, phone, created_by) values ('${CO}', app.next_doc_no('${CO}','LEAD'), 'Saima Noor', '+923214445566', '${U}') returning id`)).rows[0].id;
  const Q1 = (await q(`insert into quotations(company_id, quote_no, lead_id, property_id, valid_until, list_price, discount, down_payment, installments, first_due, created_by)
    values ('${CO}', app.next_doc_no('${CO}','QUO'), '${L2}', '${PR(1)}', current_date + 10, 2000000, 100000, 400000, 6, current_date + 30, '${U}') returning id`)).rows[0].id;
  const bkq = (await q(`select app.accept_quotation('${Q1}', '${U}') b`)).rows[0].b;
  const bq = (await q(`select b.net_price::float np, b.customer_id, (select count(*)::int from installments where booking_id=b.id) n, (select sum(amount)::float from installments where booking_id=b.id) s from bookings b where b.id='${bkq}'`)).rows[0];
  const l2 = (await q(`select stage, party_id from leads where id='${L2}'`)).rows[0];
  bq.np === 1900000 && bq.n === 7 && bq.s === 1900000 && l2.stage === "won" && l2.party_id === bq.customer_id
    ? ok("accepting a quotation turns the lead into a customer, books the property and builds the quoted plan (down + 6, adding up to the price)") : bad("accept_quotation", JSON.stringify({ bq, l2 }));
  (await q(`select app.accept_quotation('${Q1}', '${U}') b`)).rows[0].b === bkq ? ok("accepting twice gives the same booking") : bad("accept twice");
  const Q2 = (await q(`insert into quotations(company_id, quote_no, party_id, property_id, quote_date, valid_until, list_price, created_by) values ('${CO}', app.next_doc_no('${CO}','QUO'), '${PA}', '${PR(2)}', current_date - 20, current_date - 5, 1000000, '${U}') returning id`)).rows[0].id;
  await expectError("an expired quotation cannot be accepted", () => q(`select app.accept_quotation('${Q2}', '${U}')`), "expired");

  // — post-dated cheques —
  const BKC = (await q(`select app.create_booking('${PR(2)}','${PA}','installment','${U}') id`)).rows[0].id;
  await q(`select app.build_schedule('${BKC}', 100000, 4, current_date + 30)`);
  const mkChq = async (dir, no, amt, extra = "") => (await q(`insert into cheques(company_id, direction, cheque_no, bank_name, party_id, booking_id, amount, cheque_date, created_by) values ('${CO}','${dir}','${no}','HBL','${PA}',${dir === "received" ? `'${BKC}'` : "null"}, ${amt}, current_date + 15, '${U}') returning id`)).rows[0].id;
  const C1 = await mkChq("received", "700001", 100000);
  await expectError("a cheque must be deposited before it can clear", () => q(`select app.clear_cheque('${C1}', current_date, '${U}')`), "Deposit the cheque");
  await q(`select app.deposit_cheque('${C1}', '${B1.id}', current_date, '${U}')`);
  const rc = (await q(`select app.clear_cheque('${C1}', current_date, '${U}') r`)).rows[0].r;
  const ci = (await q(`select c.status, c.receipt_id, (select paid_amount::float from installments where booking_id='${BKC}' and seq=1) p from cheques c where c.id='${C1}'`)).rows[0];
  ci.status === "cleared" && ci.receipt_id === rc && ci.p === 100000 ? ok("clearing a received cheque records the receipt and pays the installment") : bad("clear_cheque", JSON.stringify(ci));
  const bankLine = (await q(`select count(*)::int n from v_bank_ledger where bank_account_id='${B1.id}' and journal_line_id in (select id from journal_lines where entry_id = (select journal_entry_id from receipts where id='${rc}'))`)).rows[0].n;
  bankLine === 1 ? ok("the cleared cheque appears in the bank account's ledger, ready to reconcile") : bad("cheque in bank ledger", bankLine);
  await expectError("a cleared cheque cannot bounce", () => q(`select app.bounce_cheque('${C1}', current_date, 'x', '${U}')`), "already cleared");
  const C2 = await mkChq("received", "700002", 50000);
  await expectError("a bounce needs a reason", () => q(`select app.bounce_cheque('${C2}', current_date, '  ', '${U}')`), "why");
  await q(`select app.bounce_cheque('${C2}', current_date, 'Insufficient funds', '${U}')`);
  (await q(`select status from cheques where id='${C2}'`)).rows[0].status === "bounced" ? ok("a bounced cheque is recorded with its reason and pays nothing") : bad("bounce");
  await expectError("a cheque we issued cannot be tied to a customer booking", () => q(`insert into cheques(company_id, direction, cheque_no, bank_name, party_id, booking_id, amount, cheque_date) values ('${CO}','issued','1','HBL','${PA}','${BKC}', 10, current_date)`));
  const C3 = await mkChq("issued", "800001", 20000);
  await q(`select app.clear_cheque('${C3}', current_date, '${U}')`);
  (await q(`select status from cheques where id='${C3}'`)).rows[0].status === "cleared" ? ok("an issued cheque can be marked cleared without posting again") : bad("issued cheque");

  // — service invoices —
  const SI = (await q(`select app.issue_service_invoice('${PA}', null, 'October 2026', current_date, current_date + 15, 12000, null, 'Maintenance', '${U}') id`)).rows[0].id;
  const sj = (await q(`select a.code, l.debit::float d, l.credit::float c from journal_lines l join gl_accounts a on a.id=l.account_id join service_invoices s on s.journal_entry_id = l.entry_id where s.id='${SI}' order by l.line_no`)).rows;
  JSON.stringify(sj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["03.01.02.0001", 12000, 0], ["04.01.03.0001", 0, 12000]])
    ? ok("a service invoice debits the customer's receivable and credits service income") : bad("service invoice entry", JSON.stringify(sj));
  await expectError("a service payment cannot exceed what is unpaid", () => q(`select app.pay_service_invoice('${SI}', 20000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}')`), "still unpaid");
  const sr = (await q(`select app.pay_service_invoice('${SI}', 5000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}') r`)).rows[0].r;
  const si = (await q(`select status, paid_amount::float p, balance::float b from v_service_invoices where id='${SI}'`)).rows[0];
  si.status === "partial" && si.p === 5000 && si.b === 7000 ? ok("a part payment leaves the invoice part paid with its balance") : bad("pay_service_invoice", JSON.stringify(si));
  await expectError("an invoice with money received cannot be voided", () => q(`select app.void_service_invoice('${SI}', '${U}', 'mistake')`), "void those receipts first");
  await q(`select set_config('app.permissions','accounts.approve', true)`);
  await asCompany(CO, async () => { await db.exec(`select set_config('app.permissions','accounts.approve', true)`); await db.exec(`select app.void_receipt('${sr}','${U}','Entered twice')`); });
  (await q(`select status from service_invoices where id='${SI}'`)).rows[0].status === "unpaid" ? ok("voiding the receipt returns the invoice to unpaid") : bad("service receipt void");
  await q(`select app.void_service_invoice('${SI}', '${U}', 'Wrong customer')`);
  (await q(`select status from service_invoices where id='${SI}'`)).rows[0].status === "void" ? ok("an unpaid invoice can be voided, reversing its entry") : bad("void service invoice");

  // — contracts —
  await expectError("an active contract must have a signing date", () => q(`insert into contracts(company_id, contract_no, kind, title, start_date, status) values ('${CO}','C-1','rent','Shop rent', current_date, 'active')`));
  await expectError("a terminated contract needs a date and a reason", () => q(`insert into contracts(company_id, contract_no, kind, title, start_date, status) values ('${CO}','C-2','rent','Shop rent', current_date, 'terminated')`));
  await q(`insert into contracts(company_id, contract_no, kind, title, party_id, start_date, end_date, status, signed_on, value) values ('${CO}','C-3','rent','Office rent','${PA}', current_date - 400, current_date - 35, 'active', current_date - 401, 600000)`);
  (await q(`select effective_status, days_left from v_contracts where contract_no='C-3'`)).rows[0].effective_status === "expired" ? ok("an active contract past its end date reads as expired") : bad("contract expiry");
}

console.log("\nStaff, leave, payroll, contractors");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const U = "b1000000-0000-0000-0000-0000000000f9";
  const PS = "9a000000-0000-0000-0000-0000000000a2";
  const PRJ = "c0000000-0000-0000-0000-0000000000d3";
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const bal = async (code) => Number((await q(`select coalesce(sum(l.debit - l.credit),0)::float b from journal_lines l join gl_accounts a on a.id=l.account_id where a.code='${code}'`)).rows[0].b);

  await db.exec(`select app.seed_leave_types('${CO}')`);
  const E1 = (await q(`insert into employees(company_id, emp_no, full_name, designation, join_date, basic_salary, house_allowance, income_tax, created_by) values ('${CO}', app.next_doc_no('${CO}','EMP'), 'Imran Sheikh', 'Sales Manager', '2026-01-01', 100000, 20000, 5000, '${U}') returning id`)).rows[0].id;
  const E2 = (await q(`insert into employees(company_id, emp_no, full_name, join_date, basic_salary, created_by) values ('${CO}', app.next_doc_no('${CO}','EMP'), 'Hina Butt', '2026-02-01', 60000, '${U}') returning id`)).rows[0].id;
  await expectError("an employee who has left needs a leaving date", () => q(`update employees set status='resigned' where id='${E2}'`));
  const T = {};
  for (const r of (await q(`select id, code from leave_types`)).rows) T[r.code] = r.id;

  const LR = (await q(`select app.request_leave('${E1}', '${T.annual}', '2026-10-05', '2026-10-09', null, 'Family trip', '${U}') id`)).rows[0].id;
  await expectError("overlapping leave is refused", () => q(`select app.request_leave('${E1}', '${T.casual}', '2026-10-08', '2026-10-12', null, null, '${U}')`), "already has leave");
  await expectError("a refusal needs a reason", () => q(`select app.decide_leave('${LR}', false, null, '${U}')`), "why");
  await q(`select app.decide_leave('${LR}', true, null, '${U}')`);
  const bl = (await q(`select taken::float t, remaining::float r from v_leave_balances where employee_id='${E1}' and code='annual'`)).rows[0];
  bl.t === 5 && bl.r === 9 ? ok("approved leave is counted against the yearly balance (14 - 5 = 9)") : bad("leave balance", JSON.stringify(bl));
  const LR2 = (await q(`select app.request_leave('${E1}', '${T.annual}', '2026-11-02', '2026-11-13', 10, 'Long trip', '${U}') id`)).rows[0].id;
  await expectError("leave beyond the yearly allowance cannot be approved", () => q(`select app.decide_leave('${LR2}', true, null, '${U}')`), "go over");
  const LR3 = (await q(`select app.request_leave('${E1}', '${T.unpaid}', '2026-12-01', '2026-12-03', null, 'Personal', '${U}') id`)).rows[0].id;
  await q(`select app.decide_leave('${LR3}', true, null, '${U}')`);

  // payroll for December: Imran has 3 unpaid days
  const RUN = (await q(`select app.create_payroll_run('${CO}', '2026-12', '${U}') id`)).rows[0].id;
  const ln = (await q(`select employee_id, basic::float b, allowances::float a, unpaid_leave_days::float d, unpaid_deduction::float u, tax::float t, net::float n from payroll_lines where run_id='${RUN}' order by basic desc`)).rows;
  ln.length === 2 && ln[0].d === 3 && ln[0].u === 12000 && ln[0].n === 100000 + 20000 - 12000 - 5000 && ln[1].n === 60000
    ? ok("a payroll line per employee; 3 unpaid days cost 3/30 of 120,000 = 12,000; net = pay - unpaid deduction - tax") : bad("payroll lines", JSON.stringify(ln));
  await expectError("one payroll per month", () => q(`select app.create_payroll_run('${CO}', '2026-12', '${U}')`), "already exists");
  await q(`select app.approve_payroll('${RUN}', '${U}')`);
  const pr = (await q(`select status, total_gross::float g, total_tax::float t, total_net::float n from payroll_runs where id='${RUN}'`)).rows[0];
  pr.status === "approved" && pr.g === 108000 + 60000 && pr.t === 5000 && pr.n === 163000 - 0 ? ok("approving books 168,000 salary expense, 5,000 tax withheld and 163,000 payable") : bad("approve_payroll", JSON.stringify(pr));
  const pj = (await q(`select a.code, l.debit::float d, l.credit::float c from journal_lines l join gl_accounts a on a.id=l.account_id join payroll_runs r on r.journal_entry_id = l.entry_id where r.id='${RUN}' order by l.line_no`)).rows;
  JSON.stringify(pj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["05.02.04.0001", 168000, 0], ["02.01.03.0003", 0, 5000], ["02.01.01.0004", 0, 163000]]) ? ok("the payroll entry balances: Dr salaries; Cr income tax payable, salaries payable") : bad("payroll entry", JSON.stringify(pj));
  await expectError("an approved payroll cannot be deleted", () => q(`select app.discard_payroll('${RUN}')`), "part of the books");
  const before = await bal("03.01.01.0001");
  await q(`select app.pay_payroll('${RUN}', '${acc["03.01.01.0001"]}', '2026-12-28', '${U}')`);
  (await bal("02.01.01.0004")) === 0 && (await bal("03.01.01.0001")) === before - 163000 && (await q(`select status from payroll_runs where id='${RUN}'`)).rows[0].status === "paid"
    ? ok("paying clears salaries payable and takes 163,000 out of cash") : bad("pay_payroll");
  const RUN2 = (await q(`select app.create_payroll_run('${CO}', '2026-11', '${U}') id`)).rows[0].id;
  await q(`select app.discard_payroll('${RUN2}')`);
  (await q(`select count(*)::int n from payroll_runs where id='${RUN2}'`)).rows[0].n === 0 ? ok("a draft payroll can be thrown away") : bad("discard payroll");

  // contractors
  const CC = (await q(`insert into construction_contracts(company_id, contract_no, contractor_id, project_id, title, contract_value, retention_pct, start_date, created_by) values ('${CO}', app.next_doc_no('${CO}','CC'), '${PS}', '${PRJ}', 'Boundary wall', 1000000, 10, current_date, '${U}') returning id`)).rows[0].id;
  const BL = (await q(`select app.create_contractor_bill('${CC}', current_date, 400000, 'First 40%', null, '${U}') id`)).rows[0].id;
  (await q(`select retention_amount::float r, net_amount::float n from contractor_bills where id='${BL}'`)).rows[0].r === 40000 ? ok("a bill takes the contract's retention rate (10% of 400,000 = 40,000)") : bad("retention");
  await q(`select app.approve_contractor_bill('${BL}', '${U}')`);
  const cj = (await q(`select a.code, l.debit::float d, l.credit::float c, l.project_id, l.party_id from journal_lines l join gl_accounts a on a.id=l.account_id join contractor_bills b on b.journal_entry_id = l.entry_id where b.id='${BL}' order by l.line_no`)).rows;
  JSON.stringify(cj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["05.01.01.0002", 400000, 0], ["02.01.01.0006", 0, 360000], ["02.01.01.0005", 0, 40000]]) && cj[0].project_id === PRJ && cj[1].party_id === PS
    ? ok("approving books the cost against the project, 360,000 owed to the contractor and 40,000 retention held") : bad("bill entry", JSON.stringify(cj));
  const BL2 = (await q(`select app.create_contractor_bill('${CC}', current_date, 700000, 'Too much', null, '${U}') id`)).rows[0].id;
  await expectError("billing more than the contract value is refused", () => q(`select app.approve_contractor_bill('${BL2}', '${U}')`), "more than the contract value");
  const vc = (await q(`select billed::float b, retention_held::float r, remaining::float m from v_construction_contracts where id='${CC}'`)).rows[0];
  vc.b === 400000 && vc.r === 40000 && vc.m === 600000 ? ok("the contract shows billed, retention held and what remains") : bad("v_construction_contracts", JSON.stringify(vc));
  const costBefore = await bal("05.01.01.0002");
  await q(`select app.void_contractor_bill('${BL}', '${U}', 'Wrong quantities')`);
  (await bal("02.01.01.0006")) === 0 && (await bal("05.01.01.0002")) === costBefore - 400000 ? ok("voiding a bill reverses its entry") : bad("void bill");
  (await asCompany("00000000-0000-0000-0000-0000000000d4", () => db.query(`select (select count(*) from employees) + (select count(*) from construction_contracts) + (select count(*) from payroll_runs) n`))).rows[0].n == 0
    ? ok("another company sees none of this staff, payroll or contractor data") : bad("hr isolation");
}

console.log("\nAttachments, late charges, refunds, transfers, dealer commission");
{
  const CO = "00000000-0000-0000-0000-0000000000d3";
  const U = "b1000000-0000-0000-0000-0000000000f9";
  const PA = "9a000000-0000-0000-0000-0000000000a1";
  const PRJ = "c0000000-0000-0000-0000-0000000000d3", TY = "70000000-0000-0000-0000-0000000000d3";
  const PR = (n) => `d9000000-0000-0000-0000-00000000000${n}`;
  const q = (sql) => asCompany(CO, () => db.query(sql));
  const acc = {};
  for (const r of (await db.query(`select code, id from gl_accounts where company_id='${CO}'`)).rows) acc[r.code] = r.id;
  const sqlNum = async (sql) => Number((await q(sql)).rows[0].n);
  const advance = (party) => sqlNum(`select coalesce(sum(l.credit - l.debit),0)::float n from journal_lines l join gl_accounts a on a.id=l.account_id where a.code='02.01.02.0001' and l.party_id='${party}'`);
  const account = (code) => sqlNum(`select coalesce(sum(l.debit - l.credit),0)::float n from journal_lines l join gl_accounts a on a.id=l.account_id where a.code='${code}'`);

  // — attachments —
  const D1 = "9b000000-0000-0000-0000-0000000000d1";
  await q(`insert into attachments(id, company_id, entity_type, entity_id, file_name, mime, size_bytes, sha256, uploaded_by) values ('${D1}','${CO}','party','${PA}','cnic.pdf','application/pdf',4,'${"a".repeat(64)}','${U}')`);
  await q(`insert into attachment_blobs(attachment_id, company_id, content) values ('${D1}','${CO}', '\\x01020304')`);
  ok("an attachment is stored with its bytes");
  await expectError("a file whose bytes do not match its recorded size is refused", () => q(`insert into attachments(id, company_id, entity_type, entity_id, file_name, mime, size_bytes, sha256) values ('9b000000-0000-0000-0000-0000000000d2','${CO}','party','${PA}','x.pdf','application/pdf',9,'${"b".repeat(64)}')`).then(() => q(`insert into attachment_blobs(attachment_id, company_id, content) values ('9b000000-0000-0000-0000-0000000000d2','${CO}','\\x0102')`)), "incomplete");
  await expectError("a file over 7 MB is refused", () => q(`insert into attachments(company_id, entity_type, entity_id, file_name, mime, size_bytes, sha256) values ('${CO}','party','${PA}','big.pdf','application/pdf',9000000,'${"c".repeat(64)}')`));
  (await asCompany("00000000-0000-0000-0000-0000000000d4", () => db.query(`select (select count(*) from attachments) + (select count(*) from attachment_blobs) n`))).rows[0].n == 0 ? ok("another company cannot see these files") : bad("attachment isolation");

  // — late charges —
  await q(`insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
    ('${PR(1)}','${CO}','${PRJ}','${TY}','PRP-L001','Plot L1',1200000), ('${PR(2)}','${CO}','${PRJ}','${TY}','PRP-L002','Plot L2',1000000),
    ('${PR(3)}','${CO}','${PRJ}','${TY}','PRP-L003','Plot L3',900000), ('${PR(4)}','${CO}','${PRJ}','${TY}','PRP-L004','Plot L4',800000)`);
  await q(`update companies set settings = settings || '{"penalty_rate_pct_month": 5, "penalty_grace_days": 5}'::jsonb where id = '${CO}'`);
  const BK = (await q(`select app.create_booking('${PR(1)}','${PA}','installment','${U}') id`)).rows[0].id;
  await q(`select app.build_schedule('${BK}', 0, 3, (current_date - 40))`);          // 3 x 400,000; the first fell due 40 days ago
  const i1 = (await q(`select id from installments where booking_id='${BK}' and seq=1`)).rows[0].id;
  const sug = await sqlNum(`select app.suggested_penalty('${i1}')::float n`);
  sug === Math.round(400000 * 5 / 100 * 35 / 30 * 100) / 100 ? ok("the suggested late charge follows the company's own rule: 5% a month, pro rata, after 5 days' grace") : bad("suggested_penalty", sug);
  await expectError("a late charge cannot be zero", () => q(`select app.assess_penalty('${i1}', 0, 'x', '${U}')`), "more than zero");
  const PEN = (await q(`select app.assess_penalty('${i1}', 20000, 'Late by 40 days', '${U}') id`)).rows[0].id;
  const pj = (await q(`select a.code, l.debit::float d, l.credit::float c from journal_lines l join gl_accounts a on a.id=l.account_id join penalty_charges p on p.journal_entry_id=l.entry_id where p.id='${PEN}' order by l.line_no`)).rows;
  JSON.stringify(pj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["03.01.02.0001", 20000, 0], ["04.01.03.0003", 0, 20000]]) ? ok("a late charge debits the customer's receivable and credits late-charge income") : bad("penalty entry", JSON.stringify(pj));
  (await sqlNum(`select app.suggested_penalty('${i1}')::float n`)) === 0 ? ok("once assessed, the same days are not charged twice") : bad("assessed_through");
  const rc = (await q(`select app.record_receipt('${BK}', 120000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}') id`)).rows[0].id;
  const pstat = (await q(`select status, paid_amount::float p from penalty_charges where id='${PEN}'`)).rows[0];
  const inst1 = (await q(`select paid_amount::float p from installments where id='${i1}'`)).rows[0].p;
  pstat.status === "paid" && inst1 === 100000 ? ok("a receipt pays the late charge first (20,000), then the installment (100,000)") : bad("penalty first", JSON.stringify({ pstat, inst1 }));
  const rj = (await q(`select a.code, l.debit::float d, l.credit::float c from journal_lines l join gl_accounts a on a.id=l.account_id join receipts r on r.journal_entry_id=l.entry_id where r.id='${rc}' order by l.line_no`)).rows;
  JSON.stringify(rj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["03.01.01.0001", 120000, 0], ["02.01.02.0001", 0, 100000], ["03.01.02.0001", 0, 20000]]) ? ok("the 20,000 that paid the late charge clears the receivable; the other 100,000 is an advance") : bad("receipt split", JSON.stringify(rj));
  await expectError("a late charge that has been paid cannot be waived", () => q(`select app.waive_penalty('${PEN}', '${U}', 'goodwill')`), "void that receipt");
  await q(`select set_config('app.permissions','accounts.approve', true)`);
  await asCompany(CO, async () => { await db.exec(`select set_config('app.permissions','accounts.approve', true)`); await db.exec(`select app.void_receipt('${rc}','${U}','Entered twice')`); });
  (await q(`select status from penalty_charges where id='${PEN}'`)).rows[0].status === "open" ? ok("voiding the receipt makes the late charge open again") : bad("penalty reopen");
  await q(`select app.waive_penalty('${PEN}', '${U}', 'Customer was abroad')`);
  (await q(`select status from penalty_charges where id='${PEN}'`)).rows[0].status === "waived" && (await account("04.01.03.0003")) === 0 ? ok("waiving an unpaid late charge reverses its entry") : bad("waive");
  const i3 = (await q(`select id from installments where booking_id='${BK}' and seq=3`)).rows[0].id;
  await expectError("an installment that is not late yet carries no late charge", () => q(`select app.assess_penalty('${i3}', 100, 'x', '${U}')`), "not late yet");

  // — refunds on a cancelled booking —
  const BR = (await q(`select app.create_booking('${PR(2)}','${PA}','installment','${U}') id`)).rows[0].id;
  await q(`select app.build_schedule('${BR}', 300000, 2, current_date + 30)`);
  await q(`select app.record_receipt('${BR}', 300000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}')`);
  await expectError("a booking must be cancelled before the customer is refunded", () => q(`select app.refund_booking('${BR}', 100000, 0, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}')`), "Cancel the booking");
  await q(`update bookings set status='cancelled', cancelled_at=now(), cancel_reason='Customer withdrew' where id='${BR}'`);
  (await sqlNum(`select app.booking_refundable('${BR}')::float n`)) === 300000 ? ok("the money received on a cancelled booking is what can be returned") : bad("refundable");
  await expectError("more than was received cannot be refunded", () => q(`select app.refund_booking('${BR}', 280000, 30000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}')`), "Only");
  const advBefore = await advance(PA);
  const cashBefore = await account("03.01.01.0001");
  const incBefore = await account("04.02.01.0001");
  const RF = (await q(`select app.refund_booking('${BR}', 200000, 50000, 'cash', '${acc["03.01.01.0001"]}', current_date, 'Per policy', '${U}') id`)).rows[0].id;
  (await advance(PA)) === advBefore - 250000 && (await account("03.01.01.0001")) === cashBefore - 200000 && (await account("04.02.01.0001")) === incBefore - 50000
    ? ok("a refund of 200,000 with a 50,000 cancellation charge: advances down 250,000, cash out 200,000, 50,000 kept as income") : bad("refund entry");
  (await sqlNum(`select app.booking_refundable('${BR}')::float n`)) === 50000 ? ok("what is left to return is tracked (50,000)") : bad("refundable after");
  await asCompany(CO, async () => { await db.exec(`select app.void_refund('${RF}','${U}','Wrong amount')`); });
  (await sqlNum(`select app.booking_refundable('${BR}')::float n`)) === 300000 ? ok("voiding a refund puts the money back on the customer's account") : bad("void_refund");

  // — transfer to another customer —
  const NEWC = "9a000000-0000-0000-0000-0000000000a9";
  await q(`insert into parties(id,company_id,display_name) values ('${NEWC}','${CO}','Transferee')`);
  const BT = (await q(`select app.create_booking('${PR(3)}','${PA}','installment','${U}') id`)).rows[0].id;
  await q(`select app.build_schedule('${BT}', 100000, 2, current_date + 30)`);
  await q(`select app.record_receipt('${BT}', 100000, 'cash', '${acc["03.01.01.0001"]}', current_date, null, '${U}')`);
  await expectError("a booking cannot be transferred to its own customer", () => q(`select app.transfer_booking('${BT}', '${PA}', 0, current_date, null, '${U}')`), "already belongs");
  const oldAdv = await advance(PA), newAdv = await advance(NEWC);
  await q(`select app.transfer_booking('${BT}', '${NEWC}', 5000, current_date, 'Family transfer', '${U}')`);
  const owner = (await q(`select customer_id from bookings where id='${BT}'`)).rows[0].customer_id;
  owner === NEWC ? ok("the booking now belongs to the new customer") : bad("transfer owner");
  (await advance(PA)) === oldAdv - 100000 && (await advance(NEWC)) === newAdv + 100000 ? ok("the 100,000 already paid moves with it, from one customer's account to the other's") : bad("transfer money");
  const fee = (await q(`select s.customer_id, s.amount::float a from service_invoices s join booking_transfers t on t.fee_invoice_id = s.id where t.booking_id='${BT}'`)).rows[0];
  fee && fee.customer_id === NEWC && fee.a === 5000 ? ok("a transfer fee is invoiced to the new customer") : bad("transfer fee", JSON.stringify(fee));
  await expectError("a cancelled booking cannot be transferred", () => q(`select app.transfer_booking('${BR}', '${NEWC}', 0, current_date, null, '${U}')`), "cancelled");

  // — dealer commission —
  const DLR = "9a000000-0000-0000-0000-0000000000aa";
  await q(`insert into parties(id,company_id,display_name) values ('${DLR}','${CO}','Dealer Imran')`);
  await q(`insert into party_roles(company_id, party_id, role) values ('${CO}','${DLR}','dealer')`);
  const BD = (await q(`select app.create_booking('${PR(4)}','${PA}','cash','${U}', null, 0, current_date, null, '${DLR}') id`)).rows[0].id;
  await expectError("a rate must be between 0 and 100 percent", () => q(`select app.accrue_commission('${BD}', 0, '${U}')`), "between 0 and 100");
  const CM = (await q(`select app.accrue_commission('${BD}', 2.5, '${U}') id`)).rows[0].id;
  const cm = (await q(`select amount::float a, base_amount::float b from dealer_commissions where id='${CM}'`)).rows[0];
  cm.a === 20000 && cm.b === 800000 ? ok("2.5% of the 800,000 sale is a commission of 20,000") : bad("commission amount", JSON.stringify(cm));
  const cj = (await q(`select a.code, l.debit::float d, l.credit::float c, l.party_id from journal_lines l join gl_accounts a on a.id=l.account_id join dealer_commissions m on m.journal_entry_id=l.entry_id where m.id='${CM}' order by l.line_no`)).rows;
  JSON.stringify(cj.map((r) => [r.code, r.d, r.c])) === JSON.stringify([["05.02.03.0003", 20000, 0], ["02.01.01.0002", 0, 20000]]) && cj.every((r) => r.party_id === DLR) ? ok("the commission is booked as an expense and a payable to the dealer") : bad("commission entry", JSON.stringify(cj));
  await expectError("commission is recorded once per booking", () => q(`select app.accrue_commission('${BD}', 1, '${U}')`), "already been recorded");
  await expectError("a booking without a dealer has no commission", () => q(`select app.accrue_commission('${BT}', 1, '${U}')`), "no dealer");
  await q(`select app.void_commission('${CM}', '${U}', 'Rate was wrong')`);
  (await account("05.02.03.0003")) === 0 ? ok("voiding a commission reverses its entry") : bad("void commission");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

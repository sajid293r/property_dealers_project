import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

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
    insert into parties(id,company_id,display_name,cnic) values ('b0000000-0000-0000-0000-000000000001','${C1}','Ahmed Khan','3520112345671');
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
const entry = (id, no, period, lines) => asCompany(C1, async () => {
  await db.exec(`insert into journal_entries(id,company_id,entry_no,entry_date,period_id,source_type) values ('${id}','${C1}','${no}','2025-08-10','${period}','voucher')`);
  for (const [i, l] of lines.entries()) {
    await db.exec(`insert into journal_lines(company_id,entry_id,line_no,account_id,debit,credit) values ('${C1}','${id}',${i + 1},'${l[0]}',${l[1]},${l[2]})`);
  }
});
const CASH = "a0000000-0000-0000-0000-000000000002", SALES = "a0000000-0000-0000-0000-000000000004", GRP = "a0000000-0000-0000-0000-000000000001";
const P2 = "e0000000-0000-0000-0000-000000000002", P1 = "e0000000-0000-0000-0000-000000000001";

await entry("11111111-0000-0000-0000-000000000001", "JV-00001", P2, [[CASH, 500000, 0], [SALES, 0, 500000]]).then(() => ok("balanced entry posts"), (e) => bad("balanced entry posts", e));
await expectError("unbalanced entry is rejected", () => entry("11111111-0000-0000-0000-000000000002", "JV-00002", P2, [[CASH, 100, 0], [SALES, 0, 90]]), "unbalanced");
await expectError("posting to group header is rejected", () => entry("11111111-0000-0000-0000-000000000003", "JV-00003", P2, [[GRP, 100, 0], [SALES, 0, 100]]), "group header");
await expectError("posting into locked period is rejected", () => entry("11111111-0000-0000-0000-000000000004", "JV-00004", P1, [[CASH, 100, 0], [SALES, 0, 100]]), "locked");
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
  values ('${id}','${C1}','${no}','d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','2025-08-10',12000000,500000,'installment','confirmed')`));
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
await expectError("duplicate CNIC within a company is rejected", () => asCompany(C1, () => db.exec(`insert into parties(company_id,display_name,cnic) values ('${C1}','Dup','3520112345671')`)), "parties_cnic_uq");
await asCompany(C2, () => db.exec(`insert into parties(company_id,display_name,cnic) values ('${C2}','Same CNIC other company','3520112345671')`)).then(() => ok("same CNIC allowed in a different company"), (e) => bad("cnic across companies", e));

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
const CT = (id, no, kind, total, items) => asCompany(C1, async () => {
  await db.exec(`insert into combined_transactions(id,company_id,txn_no,txn_date,kind,party_id,total_amount) values ('${id}','${C1}','${no}','2025-09-10','${kind}','b0000000-0000-0000-0000-000000000001',${total})`);
  for (const [type, dir, amt] of items) await db.exec(`insert into combined_transaction_items(company_id,combined_txn_id,item_type,ref_id,direction,amount) values ('${C1}','${id}','${type}',gen_random_uuid(),'${dir}',${amt})`);
});
await CT("c1000000-0000-0000-0000-000000000001", "CT-00001", "combined_receipt", 500000, [["receipt", "in", 300000], ["invoice_settlement", "in", 200000]]).then(() => ok("combined receipt: items add up to the total"), (e) => bad("combined receipt", e));
await expectError("combined receipt whose items do not add up is rejected", () => CT("c1000000-0000-0000-0000-000000000002", "CT-00002", "combined_receipt", 500000, [["receipt", "in", 300000]]), "do not add up");
await CT("c1000000-0000-0000-0000-000000000003", "CT-00003", "contra", 0, [["receipt", "in", 150000], ["bill_payment", "out", 150000]]).then(() => ok("contra: receivable and payable of one party net to zero"), (e) => bad("contra", e));
await expectError("contra that does not net to zero is rejected", () => CT("c1000000-0000-0000-0000-000000000004", "CT-00004", "contra", 0, [["receipt", "in", 150000], ["bill_payment", "out", 100000]]), "net to zero");

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
  insert into document_taxes(company_id,doc_type,doc_id,tax_code_id,base_amount,rate_pct,tax_amount,direction) values ('${C1}','booking','${B2}','${WHT}',10000000,6,600000,'withheld_from_us')`)).then(() => ok("assignment rule + per-document tax record"), (e) => bad("assignment/doc tax", e));

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
await asCompany(C1, () => db.exec(`insert into budget_commitments(id,company_id,budget_line_id,source_type,amount,committed_on) values ('c4000000-0000-0000-0000-000000000001','${C1}','${L_CIVIL}','purchase_order',400000,'2025-08-15')`));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// QA scratch (BUG-019): where does the time of a large upload go? Local sandbox, then (optionally, unauthenticated, refused at the
// body limit before it reaches any code or database) the live site.  env: API, AUTH, LIVE=1
const API = process.env.API ?? "http://localhost:4400", AUTH = process.env.AUTH ?? "http://localhost:54369";
const ms = async (fn) => { const t0 = performance.now(); const r = await fn(); return [Math.round(performance.now() - t0), r]; };
const tok = (await (await fetch(`${AUTH}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@bytecraft.local", password: "sandbox-pass" }) })).json()).access_token;
const co = (await (await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tok}` } })).json()).companies[0].companyId;
const h = { authorization: `Bearer ${tok}`, "x-company-id": co, "content-type": "application/json" };
const party = (await (await fetch(`${API}/v1/parties`, { method: "POST", headers: h, body: JSON.stringify({ name: "Upload Timing", roles: ["customer"] }) })).json());
const mk = (mb) => { const b = Buffer.alloc(Math.floor(mb * 1024 * 1024), 7); Buffer.from("%PDF-1.4 ").copy(b); return b.toString("base64"); };
for (const mb of [0.001, 1, 3.9, 4.1]) {
  const data = mk(mb);
  const [t, r] = await ms(() => fetch(`${API}/v1/attachments`, { method: "POST", headers: h, body: JSON.stringify({ entityType: "party", entityId: party.id, fileName: `t${mb}.pdf`, mime: "application/pdf", data }) }));
  console.log(`local upload ${mb} MB (body ${(data.length / 1048576).toFixed(1)} MB): ${t} ms -> ${r.status}`);
  if (r.status === 201) {
    const id = (await r.json()).id;
    const [d, f] = await ms(async () => { const x = await fetch(`${API}/v1/attachments/${id}/file`, { headers: h }); return (await x.arrayBuffer()).byteLength; });
    console.log(`local download ${mb} MB: ${d} ms (${f} bytes)`);
  }
}
if (process.env.LIVE) {
  const LIVE = "https://property-dealers-project.netlify.app/api/v1/parties";
  for (const mb of [0.5, 5.2]) {
    const body = Buffer.alloc(Math.floor(mb * 1024 * 1024), 120);
    const [t, r] = await ms(() => fetch(LIVE, { method: "POST", headers: { "content-type": "application/json" }, body }));
    console.log(`LIVE unauthenticated POST of ${mb} MB: ${t} ms -> ${r.status}`);
  }
}

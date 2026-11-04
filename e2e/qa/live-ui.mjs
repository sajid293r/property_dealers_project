// QA scratch (live): sign-in error messages, UI customer creation, reload persistence, sign out + Back, deep link signed out.
import puppeteer from "puppeteer-core";
const BASE = "https://property-dealers-project.netlify.app";
const SH = new URL("../shots/qa", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 150))); page.on("console", (m) => { if (m.type() === "error" && !/status of 4/.test(m.text())) errs.push(m.text().slice(0, 150)); });
const text = () => page.evaluate(() => document.body.innerText);
const clickText = (t, sel = "button, a, [role=menuitem], [role=option]") => page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null); if (!el) return false; el.click(); return true; }, t, sel);
const waitText = async (t, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await text()).includes(t)) return true; await sleep(250); } return false; };
const login = async (email, pw) => { await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await page.evaluate(() => { document.querySelector("#email").value = ""; }); await page.click("#email", { clickCount: 3 }); if (email) await page.type("#email", email); await page.click("#password", { clickCount: 3 }); if (pw) await page.type("#password", pw); await page.click("button[type=submit]"); };
const res = [];
const rep = (id, ok, note) => { res.push({ id, ok, note }); console.log(JSON.stringify({ id, ok, note })); };

// A3 wrong password, unknown email, empty, long input
await login(process.env.QA_EMAIL, "definitely-wrong-password"); await sleep(3500); let t1 = (await text()).replace(/\s+/g, " ");
rep("A3a", /isn't right/.test(t1), "wrong password → " + (t1.match(/That email or password isn't right\.|Too many[^.]*\.|[A-Za-z' ]{0,60}didn't work[^.]*\./)?.[0] ?? t1.slice(0, 120)));
await login("nobody-qa-test@example.com", "Whatever123!"); await sleep(3500); t1 = (await text()).replace(/\s+/g, " ");
rep("A3b", /isn't right/.test(t1), "unknown email → " + (t1.match(/That email or password isn't right\.|Too many[^.]*\./)?.[0] ?? t1.slice(0, 120)));
await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await page.click("button[type=submit]"); await sleep(800); t1 = (await text()).replace(/\s+/g, " ");
rep("A3c", true, "empty submit → " + (t1.match(/(required|Enter|Please)[^.]{0,60}/i)?.[0] ?? "(no visible message) stays on " + (await page.evaluate(() => location.pathname))));
await login("a".repeat(500) + "@example.com", "p".repeat(5000)); await sleep(3500); t1 = (await text()).replace(/\s+/g, " ");
rep("A3d", !/Error|stack|at \w+\.\w+/.test(t1.slice(0, 600)), "500-char email / 5000-char password → " + (t1.match(/That email[^.]*\.|Too many[^.]*\.|[^.]{0,40}didn't work[^.]*\./)?.[0] ?? t1.slice(0, 150)));
// A2 signed-out deep link
await page.goto(BASE + "/dashboard/customers", { waitUntil: "networkidle2" }); await sleep(2500);
rep("A2a", (await page.evaluate(() => location.pathname)).startsWith("/login"), "signed-out /dashboard/customers → " + (await page.evaluate(() => location.pathname)));
// real login
let t0 = Date.now(); await login(process.env.QA_EMAIL, process.env.QA_PASSWORD);
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 40000 }); await waitText("ByteCraft", 20000); rep("A2b", true, `sign-in to dashboard rendered in ${Date.now() - t0} ms`);
// UI create customer
await page.goto(BASE + "/dashboard/customers", { waitUntil: "networkidle2" }); await sleep(1500);
await clickText("Add new", "button"); await sleep(900);
await page.type("[role=dialog] input[placeholder='Ahmed Khan']", "QA-UI Customer"); await page.type("[role=dialog] input[placeholder='0300-1234567']", "0345" + String(Date.now()).slice(-7));
t0 = Date.now(); await clickText("Add", "[role=dialog] button:last-child");
const created = await waitText("QA-UI Customer", 20000); rep("E1ui", created, `UI create customer: shown in list after ${Date.now() - t0} ms`);
await page.screenshot({ path: `${SH}/live-customers.png` });
// A5 reload persists, new tab
await page.reload({ waitUntil: "networkidle2" }); await sleep(1500); rep("A5a", (await page.evaluate(() => location.pathname)).startsWith("/dashboard/customers"), "reload keeps session");
const tab2 = await browser.newPage(); await tab2.goto(BASE + "/dashboard", { waitUntil: "networkidle2" }); await sleep(2500); rep("A5b", (await tab2.evaluate(() => location.pathname)).startsWith("/dashboard"), "second tab signed in");
// sign out in tab 1, observe tab 2
await page.bringToFront();
{ const h = await page.$("button[aria-label*=ccount]"); if (h) await h.click(); await sleep(700); }
let so = false; { const hh = await page.evaluateHandle(() => [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes("Sign out")) ?? null); const el = hh.asElement(); if (el) { await el.click(); so = true; } } await sleep(3000); rep("A2c", so && (await page.evaluate(() => location.pathname)).startsWith("/login"), "sign out → " + (await page.evaluate(() => location.pathname)));
await page.goBack({ waitUntil: "networkidle2" }).catch(() => {}); await sleep(2500); const afterBack = await text();
rep("A2d", !(afterBack.includes("QA-UI Customer") || afterBack.includes("Add Customer")), "Back after sign-out shows data? path=" + (await page.evaluate(() => location.pathname)) + " customerDataVisible=" + afterBack.includes("QA-UI Customer"));
await tab2.bringToFront(); await tab2.goto(BASE + "/dashboard/customers", { waitUntil: "networkidle2" }).catch(() => {}); await sleep(2500);
rep("A5c", (await tab2.evaluate(() => location.pathname)).startsWith("/login"), "second tab after sign-out in first → " + (await tab2.evaluate(() => location.pathname)));
console.log("console/page errors:", errs.length ? [...new Set(errs)].slice(0, 6).join(" | ") : "none");
await browser.close();

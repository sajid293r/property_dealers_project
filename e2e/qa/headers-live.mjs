import puppeteer from "puppeteer-core"; import fs from "node:fs";
const BASE = process.env.BASE, SP = process.env.SP; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"], defaultViewport: { width: 1200, height: 800 } });
// 1. framing from a local page
fs.writeFileSync(SP + "/frame-test.html", `<html><body><h1>QA frame test</h1><iframe id="f" src="${BASE}/login" width="900" height="500"></iframe></body></html>`);
const fp = await browser.newPage(); const msgs = [];
fp.on("console", (m) => msgs.push(m.text())); 
await fp.goto("file:///" + SP + "/frame-test.html", { waitUntil: "load" }); await sleep(5000);
const fr = fp.frames().find((f) => f !== fp.mainFrame());
let body = ""; try { body = await fr.evaluate(() => document.body?.innerText ?? ""); } catch (e) { body = "(cannot read: " + e.message.slice(0, 60) + ")"; }
console.log("IFRAME: frame url =", fr?.url(), "| body text =", JSON.stringify(body.slice(0, 80)), "| login form visible =", /sign in/i.test(body));
console.log("IFRAME console:", msgs.filter((m) => /frame|refused|CSP|Content Security/i.test(m)).join(" ; ") || "(none)");
await fp.screenshot({ path: "e2e/shots/qa/retest-iframe.png" });
// 2. nothing broke: sign in, languages, fonts, console
const page = await (await browser.createBrowserContext()).newPage(); const bad = []; const cspv = [];
page.on("console", (m) => { const t = m.text(); if (/content security policy|refused to/i.test(t)) cspv.push(t.slice(0, 160)); else if (m.type() === "error" && !/status of 4/.test(t)) bad.push(t.slice(0, 120)); });
page.on("pageerror", (e) => bad.push("pageerror " + e.message.slice(0, 100)));
await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(4000);
const openMenu = async () => { const h = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe"))); await h.asElement()?.click(); await sleep(700); };
const pick = async (label) => { await openMenu(); await page.evaluate((l) => [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes(l))?.click(), label); await sleep(3500); };
const info = () => page.evaluate(async () => { await document.fonts.ready; const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")); return { lang: document.documentElement.lang, dir: document.documentElement.dir, h1: (document.querySelector("main h1, main h2")?.innerText ?? "").slice(0, 30), fontsLoaded: [...new Set(loaded)].slice(0, 6), body: getComputedStyle(document.body).fontFamily.slice(0, 80), over: document.documentElement.scrollWidth - window.innerWidth }; });
console.log("EN:", JSON.stringify(await info())); await page.screenshot({ path: "e2e/shots/qa/retest-en.png" });
for (const [label, tag] of [["اردو", "ur"], ["中文", "zh"], ["日本語", "ja"], ["العربية", "ar"]]) { await pick(label); console.log(tag.toUpperCase() + ":", JSON.stringify(await info())); await page.screenshot({ path: `e2e/shots/qa/retest-${tag}.png` }); }
await pick("English"); console.log("back to EN:", JSON.stringify((await info()).lang));
// sign out
const out = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^UM$|avatar/i.test(x.textContent.trim())); return !!b; });
await page.goto(BASE + "/dashboard/account", { waitUntil: "domcontentloaded" }); await sleep(4000);
const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll("button, a")].find((x) => /sign out/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
if (!clicked) { const h = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].pop()); await h.asElement()?.click(); await sleep(800); await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((e) => /sign out/i.test(e.textContent))?.click()); }
await sleep(4000); console.log("after sign-out url:", new URL(page.url()).pathname);
await page.goto(BASE + "/dashboard/customers", { waitUntil: "domcontentloaded" }); await sleep(4000); console.log("signed-out /dashboard/customers ->", new URL(page.url()).pathname);
console.log("CSP violations:", cspv.length ? cspv.join(" | ") : "none", "| console errors:", bad.length ? bad.slice(0, 4).join(" | ") : "none");
await browser.close();

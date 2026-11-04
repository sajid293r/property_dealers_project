const fs = require("fs");
const path = require("path");
process.chdir("D:/BYTE_CRAFT/Property_Dealers_Project");
let total = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) {
      let s = fs.readFileSync(p, "utf8");
      const re = /className="grid gap-(\d+) (sm|md|lg|xl):grid-cols-/g;
      const n = (s.match(re) || []).length;
      if (n) {
        s = s.replace(re, (_m, gap, bp) => `className="grid grid-cols-1 gap-${gap} ${bp}:grid-cols-`);
        fs.writeFileSync(p, s);
        total += n;
        console.log(p, n);
      }
    }
  }
}
walk("components/live");
walk("app/dashboard");
console.log("replaced", total);

import { amountInWords } from "../../lib/amount-words.ts";
for (const a of ["100000", "1250000.50", "120000000", "0.01", "99999999.99", "100000000", "1000000000", "0", "1.5", "12345.67"]) {
  console.log(a.padStart(12), "| EN:", amountInWords(a, "en"), "| UR:", amountInWords(a, "ur"), "| DE:", amountInWords(a, "de"));
}

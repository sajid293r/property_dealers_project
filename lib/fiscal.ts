/** Fiscal years run July to June. Dates are plain "YYYY-MM-DD" strings, never time-zone shifted. */
const pad = (n: number) => String(n).padStart(2, "0");

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function fiscalYearOf(iso: string): { name: string; from: string; to: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return { name: `FY${start}-${pad((start + 1) % 100)}`, from: `${start}-07-01`, to: `${start + 1}-06-30` };
}

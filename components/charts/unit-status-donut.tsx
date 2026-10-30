"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Unit } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

const COLORS: Record<string, string> = {
  available: "var(--chart-1)",
  reserved: "var(--gold)",
  sold: "var(--chart-4)",
};

export function UnitStatusDonut({ units }: { units: Unit[] }) {
  const t = useT();
  const counts = {
    available: units.filter((u) => u.status === "available").length,
    reserved: units.filter((u) => u.status === "reserved").length,
    sold: units.filter((u) => u.status === "sold").length,
  };
  const data = Object.entries(counts).map(([key, value]) => ({ key, name: t(`status.${key}`), value }));
  const total = units.length;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={82}
            paddingAngle={3}
            cornerRadius={6}
            animationDuration={800}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={COLORS[entry.key]} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              return (
                <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  {p.name}: <span className="font-medium">{p.value as number}</span>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-2xl font-semibold">{total}</span>
        <span className="text-[11px] text-muted-foreground">{t("properties.kpi.total")}</span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: COLORS[d.key] }}
            />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

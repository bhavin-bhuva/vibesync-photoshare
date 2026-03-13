"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export type PlanBreakdown = {
  plan:       "FREE" | "PRO" | "STUDIO";
  totalBytes: string; // serialized bigint
  userCount:  number;
};

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)         return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const PLAN_COLORS: Record<string, string> = {
  FREE:   "#71717a",  // zinc-500
  PRO:    "#3b82f6",  // blue-500
  STUDIO: "#8b5cf6",  // violet-500
};

const PLAN_LABELS: Record<string, string> = {
  FREE:   "Free",
  PRO:    "Pro",
  STUDIO: "Studio",
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { plan: string; bytes: number; userCount: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-zinc-800">{PLAN_LABELS[d.plan]} Plan</p>
      <p className="text-zinc-500">{fmtBytes(d.bytes)} total</p>
      <p className="text-zinc-500">{d.userCount} user{d.userCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

export function StorageChart({ data }: { data: PlanBreakdown[] }) {
  const chartData = data.map((d) => ({
    plan:      d.plan,
    label:     PLAN_LABELS[d.plan],
    bytes:     Number(BigInt(d.totalBytes)),
    userCount: d.userCount,
    // Convert to GB for display
    gb:        Number(BigInt(d.totalBytes)) / 1_073_741_824,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => v >= 1 ? `${v.toFixed(0)} GB` : `${(v * 1024).toFixed(0)} MB`}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f4f4f5" }} />
        <Bar dataKey="gb" radius={[6, 6, 0, 0]} maxBarSize={80}>
          {chartData.map((entry) => (
            <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

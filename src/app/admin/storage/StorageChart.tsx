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
import { useTheme } from "@/hooks/useTheme";

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
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 shadow-lg text-xs text-content-primary">
      <p className="font-semibold text-content-primary">{PLAN_LABELS[d.plan]} Plan</p>
      <p className="text-content-secondary">{fmtBytes(d.bytes)} total</p>
      <p className="text-content-secondary">{d.userCount} user{d.userCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

export function StorageChart({ data }: { data: PlanBreakdown[] }) {
  const { resolvedTheme } = useTheme();

  const chartColors = {
    grid:   resolvedTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    cursor: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    tickPrimary:   resolvedTheme === 'dark' ? '#71717A' : '#52525B',
    tickSecondary: resolvedTheme === 'dark' ? '#A1A1AA' : '#71717A',
  };

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
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: chartColors.tickPrimary }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => v >= 1 ? `${v.toFixed(0)} GB` : `${(v * 1024).toFixed(0)} MB`}
          tick={{ fontSize: 11, fill: chartColors.tickSecondary }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: chartColors.cursor }} />
        <Bar dataKey="gb" radius={[6, 6, 0, 0]} maxBarSize={80}>
          {chartData.map((entry) => (
            <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

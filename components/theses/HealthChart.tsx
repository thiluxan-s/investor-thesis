"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export type HealthPoint = { recordedAt: string; score: number };

export function HealthChart({ points }: { points: HealthPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
        Run analysis over time to see the trend
      </div>
    );
  }
  const data = points.map((p) => ({
    label: new Date(p.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: p.score,
  }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <ReferenceLine y={0} stroke="#e4e4e7" strokeWidth={1} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
          <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }}
            formatter={(v) => [(v as number).toFixed(2), "Health"]}
          />
          <Line type="monotone" dataKey="score" stroke="#1E3A5F" strokeWidth={2} dot={{ r: 2.5, fill: "#1E3A5F" }} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

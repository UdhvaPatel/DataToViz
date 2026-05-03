"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { aggregateRows, toNum, type Row } from "./chartUtils";
import { formatColumnName } from "@/lib/viz/utils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface PieChartComponentProps {
  data: Row[];
  xAxis: string | null;
  yAxis: string | null;
  groupBy: string | null;
  colorBy: string | null;
  title: string;
  narrative: string;
  relevance: ChartRelevance;
  /** Pass a positive value (e.g. 60) to render as a donut. Defaults to 0 (pie). */
  innerRadius?: number;
  chartId?: string;
}

const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

export function PieChartComponent({
  data,
  xAxis,
  yAxis,
  title,
  narrative,
  relevance,
  innerRadius = 0,
  chartId,
}: PieChartComponentProps) {
  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);

  const filteredData = xAxis ? applyFiltersExcept(data, xAxis) : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  const selfFilter = xAxis ? filters.find((f) => f.column === xAxis) : null;
  const isActive = (name: string) =>
    !selfFilter || selfFilter.values.some((v) => String(v) === String(name));

  if (!xAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  const slices = (() => {
    if (yAxis) {
      return aggregateRows(filteredData, xAxis, yAxis)
        .filter((r) => toNum(r.value) !== null && r.value > 0)
        .slice(0, 10);
    }
    const freq = new Map<string, number>();
    for (const row of filteredData) {
      if (row[xAxis] == null) continue;
      const k = String(row[xAxis]);
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    return [...freq.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  })();

  if (slices.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No plottable slices found" />
      </ChartCard>
    );
  }

  const total = slices.reduce((s, r) => s + r.value, 0);

  const renderLabel = ({
    cx, cy, midAngle, innerRadius: ir, outerRadius, percent,
  }: {
    cx: number; cy: number; midAngle: number;
    innerRadius: number; outerRadius: number; percent: number;
  }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = ir + (outerRadius - ir) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x} y={y} fill="white" textAnchor="middle"
        dominantBaseline="central" fontSize={10} fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      {innerRadius > 0 && (
        <p className="mb-1 text-center text-base font-bold tabular-nums text-foreground">
          {total.toLocaleString()}
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={innerRadius}
                labelLine={false}
                label={renderLabel}
                style={{ cursor: "pointer" }}
                onClick={(entry) => {
                  if (entry?.name != null) toggleFilter(xAxis, entry.name);
                }}
              >
                {slices.map((s, i) => (
                  <Cell
                    key={i}
                    fill={getColor(i)}
                    fillOpacity={isActive(s.name) ? 1 : 0.25}
                  />
                ))}
              </Pie>
              <Tooltip
                {...CHART_THEME.tooltip}
                formatter={(value: number) => [
                  Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2),
                  "",
                ]}
              />
              <Legend
                {...CHART_THEME.legend}
                formatter={(value: string) => {
                  const formatted = formatColumnName(value);
                  return formatted.length > 18 ? formatted.slice(0, 18) + "…" : formatted;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}

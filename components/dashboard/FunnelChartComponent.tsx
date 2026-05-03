"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { aggregateRows, toNum, truncate, type Row } from "./chartUtils";
import { formatColumnName } from "@/lib/viz/utils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface FunnelChartComponentProps {
  data: Row[];
  xAxis: string | null;
  yAxis: string | null;
  groupBy: string | null;
  colorBy: string | null;
  title: string;
  narrative: string;
  relevance: ChartRelevance;
  chartId?: string;
}

const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

export function FunnelChartComponent({
  data,
  xAxis,
  yAxis,
  title,
  narrative,
  relevance,
  chartId,
}: FunnelChartComponentProps) {
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

  const stages = (() => {
    if (yAxis) {
      return aggregateRows(filteredData, xAxis, yAxis)
        .filter((r) => toNum(r.value) !== null && r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
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
      .slice(0, 8);
  })();

  if (stages.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No stage values found" />
      </ChartCard>
    );
  }

  const maxVal = stages[0].value;

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <FunnelChart margin={{ top: 4, right: 80, left: 80, bottom: 4 }}>
              <Tooltip
                {...CHART_THEME.tooltip}
                formatter={(value: number) => [
                  `${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)} (${((value / maxVal) * 100).toFixed(1)}%)`,
                  "",
                ]}
              />
              <Funnel dataKey="value" data={stages} isAnimationActive>
                {stages.map((stage, i) => (
                  <Cell
                    key={i}
                    fill={getColor(i)}
                    fillOpacity={isActive(stage.name) ? 1 : 0.25}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleFilter(xAxis, stage.name)}
                  />
                ))}
                <LabelList
                  position="right"
                  fill="hsl(var(--foreground))"
                  stroke="none"
                  fontSize={11}
                  dataKey="name"
                  formatter={(v: string) => truncate(formatColumnName(v), 16)}
                />
                <LabelList
                  position="left"
                  fill="hsl(var(--muted-foreground))"
                  stroke="none"
                  fontSize={10}
                  dataKey="value"
                  formatter={(v: number) =>
                    Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
                  }
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}

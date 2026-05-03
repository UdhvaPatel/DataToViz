"use client";

import { AnimatePresence, motion } from "framer-motion";
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
import { ChartCard, EmptyChart } from "./ChartCard";
import { toNum, computeBins, type Row, type HistBin } from "./chartUtils";
import { formatColumnName } from "@/lib/viz/utils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { useFilterStore, isRangeFilter } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface HistogramComponentProps {
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

export function HistogramComponent({
  data,
  xAxis,
  title,
  narrative,
  relevance,
  chartId,
}: HistogramComponentProps) {
  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);

  // Apply other charts' filters but keep full distribution for this axis
  const filteredData = xAxis ? applyFiltersExcept(data, xAxis) : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  // Check which bins are currently in the range filter for this column
  const selfFilter = xAxis ? filters.find((f) => f.column === xAxis) : null;
  const rangeFilters = selfFilter?.values.filter(isRangeFilter) ?? [];

  const isBinActive = (bin: HistBin): boolean => {
    if (rangeFilters.length === 0) return true;
    return rangeFilters.some((r) => {
      const rMin = typeof r.min === "number" ? r.min : parseFloat(String(r.min));
      const rMax = typeof r.max === "number" ? r.max : parseFloat(String(r.max));
      return bin.min >= rMin - 1e-9 && bin.max <= rMax + 1e-9;
    });
  };

  if (!xAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  const values = filteredData
    .map((r) => toNum(r[xAxis]))
    .filter((v): v is number => v !== null);

  const bins = computeBins(values);

  if (bins.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No numeric values found" />
      </ChartCard>
    );
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload: { name: string; count: number } }[];
  }) => {
    if (!active || !payload?.length) return null;
    const { name, count } = payload[0].payload;
    return (
      <div style={CHART_THEME.tooltip.contentStyle} className="px-3 py-2">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {formatColumnName(xAxis!)}
        </p>
        <p className="font-medium">{name}</p>
        <p className="text-muted-foreground">Count: {count.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={bins}
              margin={{ top: 4, right: 16, left: 8, bottom: 20 }}
              barCategoryGap={1}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} {...CHART_THEME.grid} />
              <XAxis
                dataKey="name"
                {...CHART_THEME.axis}
                angle={-40}
                textAnchor="end"
                height={60}
                interval={Math.max(0, Math.floor(bins.length / 8) - 1)}
                label={{
                  value: formatColumnName(xAxis!),
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <YAxis
                {...CHART_THEME.axis}
                width={52}
                label={{
                  value: "Count",
                  angle: -90,
                  position: "insideLeft",
                  dy: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                radius={[2, 2, 0, 0]}
                onClick={(payload: unknown) => {
                  const bin = payload as HistBin;
                  if (bin?.min !== undefined && bin?.max !== undefined) {
                    toggleFilter(xAxis, { min: bin.min, max: bin.max });
                  }
                }}
              >
                {bins.map((bin, i) => (
                  <Cell
                    key={i}
                    fill={getColor(0)}
                    fillOpacity={
                      isBinActive(bin)
                        ? 0.5 + 0.5 * (i / bins.length)
                        : 0.15
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}

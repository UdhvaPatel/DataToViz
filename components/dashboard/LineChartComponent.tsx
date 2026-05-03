"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { aggregateRows, pivotRows, truncate, type Row } from "./chartUtils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { lttb } from "@/lib/viz/downsample";
import { formatColumnName, formatAxisDate, decodeBinaryAxis } from "@/lib/viz/utils";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

interface LineChartComponentProps {
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

export function LineChartComponent({
  data,
  xAxis,
  yAxis,
  groupBy,
  title,
  narrative,
  relevance,
  chartId,
}: LineChartComponentProps) {
  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);

  const filteredData = xAxis ? applyFiltersExcept(data, xAxis) : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  if (!xAxis || !yAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  const { chartData, groups } = (() => {
    if (groupBy) {
      const { data: d, groups: g } = pivotRows(filteredData, xAxis, yAxis, groupBy);
      return { chartData: d.length > 200 ? lttb(d, 200) : d, groups: g };
    }
    const raw = aggregateRows(filteredData, xAxis, yAxis);
    return {
      chartData: raw.length > 200 ? lttb(raw, 200, "name", "value") : raw,
      groups: ["value"] as string[],
    };
  })();

  if (chartData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No plottable values found" />
      </ChartCard>
    );
  }

  // Detect datetime x-axis and compute span for adaptive label formatting
  const firstName = String(chartData[0]["name"] ?? "");
  const isDatetime = ISO_DATE_RE.test(firstName);
  let spanDays = 0;
  if (isDatetime && chartData.length > 1) {
    const timestamps = chartData
      .map((r) => new Date(String(r["name"] ?? "")).getTime())
      .filter((t) => !Number.isNaN(t));
    if (timestamps.length >= 2) {
      spanDays =
        (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24);
    }
  }

  const isGrouped = groups.length > 1;

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 8, bottom: isDatetime ? 20 : 40 }}
              style={{ cursor: "pointer" }}
              onClick={(state) => {
                if (state?.activeLabel != null) {
                  toggleFilter(xAxis, state.activeLabel);
                }
              }}
            >
              <CartesianGrid {...CHART_THEME.grid} />
              <XAxis
                dataKey="name"
                {...CHART_THEME.axis}
                angle={-35}
                textAnchor="end"
                height={isDatetime ? 60 : undefined}
                interval={
                  isDatetime
                    ? Math.max(0, Math.ceil(chartData.length / 8) - 1)
                    : "preserveStartEnd"
                }
                tickFormatter={
                  isDatetime
                    ? (v: string) => formatAxisDate(v, spanDays)
                    : (v: string) => decodeBinaryAxis(v, xAxis) !== v
                      ? decodeBinaryAxis(v, xAxis)
                      : truncate(v)
                }
                label={{
                  value: formatColumnName(xAxis),
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <YAxis
                {...CHART_THEME.axis}
                width={52}
                label={{
                  value: formatColumnName(yAxis),
                  angle: -90,
                  position: "insideLeft",
                  dy: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <Tooltip
                {...CHART_THEME.tooltip}
                labelFormatter={
                  isDatetime
                    ? (label: string) => {
                        const d = new Date(String(label));
                        return Number.isNaN(d.getTime())
                          ? String(label)
                          : d.toLocaleString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                      }
                    : (label: string) =>
                        decodeBinaryAxis(String(label), xAxis)
                }
                formatter={(value, name) => {
                  const displayValue =
                    typeof value === "number"
                      ? Number.isInteger(value)
                        ? value.toLocaleString()
                        : value.toFixed(2)
                      : String(value ?? "");
                  const dataKey = String(name ?? "");
                  const displayName =
                    dataKey === "value"
                      ? formatColumnName(yAxis)
                      : formatColumnName(dataKey);
                  return [displayValue, displayName];
                }}
              />
              {isGrouped && <Legend {...CHART_THEME.legend} />}
              {groups.map((g, i) => (
                <Line
                  key={g}
                  dataKey={g}
                  stroke={getColor(i)}
                  strokeWidth={2}
                  dot={chartData.length <= 30}
                  activeDot={{ r: 5, style: { cursor: "pointer" } }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}

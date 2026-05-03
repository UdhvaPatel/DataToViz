"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EyeOff,
  Eye,
  Trash2,
  RefreshCw,
  BarChart2,
  TrendingUp,
  ScatterChart,
  PieChart,
  BarChart,
  LayoutGrid,
  CircleDot,
  Filter,
  LineChart,
} from "lucide-react";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { chartAlternatives } from "@/lib/viz/chartCompatibility";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Chart type metadata
// ---------------------------------------------------------------------------

const CHART_TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  bar:       { label: "Bar Chart",     icon: <BarChart2 className="h-3.5 w-3.5" /> },
  line:      { label: "Line Chart",    icon: <LineChart className="h-3.5 w-3.5" /> },
  scatter:   { label: "Scatter Plot",  icon: <ScatterChart className="h-3.5 w-3.5" /> },
  pie:       { label: "Pie Chart",     icon: <PieChart className="h-3.5 w-3.5" /> },
  donut:     { label: "Donut Chart",   icon: <PieChart className="h-3.5 w-3.5" /> },
  histogram: { label: "Histogram",     icon: <BarChart className="h-3.5 w-3.5" /> },
  heatmap:   { label: "Heatmap",       icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  bubble:    { label: "Bubble Chart",  icon: <CircleDot className="h-3.5 w-3.5" /> },
  funnel:    { label: "Funnel Chart",  icon: <Filter className="h-3.5 w-3.5" /> },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChartWrapperProps {
  chartId: string;
  chartType: string;
  children: React.ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChartWrapper({ chartId, chartType, children, className }: ChartWrapperProps) {
  const [hovered, setHovered]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTypeMenu, setShowTypeMenu]   = useState(false);

  const chartVisibility  = usePipelineStore((s) => s.chartVisibility);
  const toggleVisibility = usePipelineStore((s) => s.toggleChartVisibility);
  const removeChart      = usePipelineStore((s) => s.removeChart);
  const changeChartType  = usePipelineStore((s) => s.changeChartType);

  const isVisible    = chartVisibility[chartId] !== false;
  const alternatives = (chartAlternatives[chartType] ?? []).slice(0, 3);

  // ── Collapsed state (hidden chart) ────────────────────────────────────────
  if (!isVisible) {
    return (
      <div className={cn("rounded-xl border border-border bg-muted/30 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Hidden
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {CHART_TYPE_META[chartType]?.label ?? chartType}
            </span>
          </div>
          <button
            type="button"
            title="Show chart"
            onClick={() => toggleVisibility(chartId)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("group relative", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setConfirmDelete(false);
        setShowTypeMenu(false);
      }}
    >
      {/* ── Floating toolbar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-background/95 px-1 py-1 shadow-md backdrop-blur-sm"
          >
            {/* Hide */}
            <button
              type="button"
              title="Hide chart"
              onClick={() => toggleVisibility(chartId)}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>

            {/* Remove with inline confirm */}
            {confirmDelete ? (
              <div className="flex items-center gap-1 px-1">
                <span className="text-[11px] text-muted-foreground">Remove?</span>
                <button
                  type="button"
                  onClick={() => {
                    removeChart(chartId);
                    setConfirmDelete(false);
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                title="Remove chart"
                onClick={() => setConfirmDelete(true)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Change chart type */}
            {alternatives.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  title="Change chart type"
                  onClick={() => setShowTypeMenu((o) => !o)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>

                <AnimatePresence>
                  {showTypeMenu && (
                    <motion.div
                      key="type-menu"
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                    >
                      {alternatives.map((alt, i) => {
                        const meta = CHART_TYPE_META[alt];
                        return (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => {
                              changeChartType(chartId, alt);
                              setShowTypeMenu(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent"
                          >
                            <span className="text-muted-foreground">{meta?.icon}</span>
                            <span className="flex-1 text-left">{meta?.label ?? alt}</span>
                            {i === 0 && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                Best
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chart content ────────────────────────────────────────────────── */}
      {children}
    </div>
  );
}

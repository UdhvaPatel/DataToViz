"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Moon,
  Sun,
  PanelLeft,
  PanelLeftClose,
  Database,
  Trash2,
  Wand2,
  AlertTriangle,
  Download,
  BookOpen,
  BarChart2,
  Home,
  Upload,
  History,
} from "lucide-react";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { updateLastActive } from "@/lib/supabase/auth";
import { FilterPanel } from "@/components/dashboard/FilterPanel";
import { BarChartComponent } from "@/components/dashboard/BarChartComponent";
import { LineChartComponent } from "@/components/dashboard/LineChartComponent";
import { ScatterChartComponent } from "@/components/dashboard/ScatterChartComponent";
import { PieChartComponent } from "@/components/dashboard/PieChartComponent";
import { HistogramComponent } from "@/components/dashboard/HistogramComponent";
import { HeatmapComponent } from "@/components/dashboard/HeatmapComponent";
import { BubbleChartComponent } from "@/components/dashboard/BubbleChartComponent";
import { FunnelChartComponent } from "@/components/dashboard/FunnelChartComponent";
import { ChartAnimationDelay } from "@/components/dashboard/ChartCard";
import { ChartErrorBoundary } from "@/components/dashboard/ChartErrorBoundary";
import { ChartWrapper } from "@/components/dashboard/ChartWrapper";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ChartBlueprint, ChartRelevance, ChartType } from "@/types/data";
import type { Rows } from "@/lib/store/pipelineStore";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const RELEVANCE_ORDER: Record<ChartRelevance, number> = {
  high: 0,
  medium: 1,
  exploratory: 2,
};

function shortNarrative(text: string, maxWords = 8): string {
  const sentence = text.split(/[.!?]/)[0].trim();
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  return words.slice(0, maxWords).join(" ") + "…";
}

function sortCharts(charts: ChartBlueprint[]): ChartBlueprint[] {
  return [...charts].sort(
    (a, b) =>
      RELEVANCE_ORDER[a.relevance] - RELEVANCE_ORDER[b.relevance] ||
      a.order - b.order
  );
}

// ---------------------------------------------------------------------------
// Theme hook — class-based dark mode via localStorage
// ---------------------------------------------------------------------------

function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("dtv-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored ? stored === "dark" : prefersDark;
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("dtv-theme", next ? "dark" : "light");
      return next;
    });
  };

  return { isDark, toggle };
}

// ---------------------------------------------------------------------------
// Chart renderer — dispatches to the correct component by chartType
// ---------------------------------------------------------------------------

function renderChart(bp: ChartBlueprint, data: Rows, chartType: ChartType) {
  const common = {
    data,
    xAxis: bp.xAxis,
    yAxis: bp.yAxis,
    groupBy: bp.groupBy,
    colorBy: bp.colorBy,
    title: bp.title,
    narrative: bp.narrative,
    relevance: bp.relevance,
    chartId: bp.chartId,
  };

  switch (chartType) {
    case "bar":       return <BarChartComponent {...common} />;
    case "line":      return <LineChartComponent {...common} />;
    case "scatter":   return <ScatterChartComponent {...common} />;
    case "pie":       return <PieChartComponent {...common} />;
    case "donut":     return <PieChartComponent {...common} innerRadius={60} />;
    case "histogram": return <HistogramComponent {...common} />;
    case "heatmap":   return <HeatmapComponent {...common} />;
    case "bubble":    return <BubbleChartComponent {...common} />;
    case "funnel":    return <FunnelChartComponent {...common} />;
    default:          return null;
  }
}

// ---------------------------------------------------------------------------
// NavIconButton — ghost icon button with title tooltip
// ---------------------------------------------------------------------------

function NavIconButton({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { isDark, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    document.title = "Dashboard · DataToViz";
  }, []);

  // Pipeline state
  const blueprint          = usePipelineStore((s) => s.dashboardBlueprint);
  const vizReadyRows       = usePipelineStore((s) => s.vizReadyRows);
  const diffSummary        = usePipelineStore((s) => s.diffSummary);
  const engineeredMeta     = usePipelineStore((s) => s.engineeredMeta);
  const selectedChartIds   = usePipelineStore((s) => s.selectedChartIds);
  const user               = usePipelineStore((s) => s.user);
  const isSaving           = usePipelineStore((s) => s.isSaving);
  const currentSessionId   = usePipelineStore((s) => s.currentSessionId);

  // Chart control state from store
  const chartTypeOverrides = usePipelineStore((s) => s.chartTypeOverrides);

  // Local UI state
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [hiddenFeatures, setHiddenFeatures] = useState<Set<string>>(new Set());
  const [downloading,    setDownloading]    = useState(false);
  const [savedPulse,     setSavedPulse]     = useState(false);

  // Guard: redirect to /upload if pipeline hasn't produced data
  useEffect(() => {
    if (!blueprint || !vizReadyRows) router.replace("/upload");
  }, [blueprint, vizReadyRows, router]);

  // Update last_active_at on load
  useEffect(() => {
    if (user?.id) updateLastActive(user.id);
  }, [user?.id]);

  // Show "saved" pulse when session is newly saved (currentSessionId set in processing page)
  useEffect(() => {
    if (currentSessionId) {
      setSavedPulse(true);
      const t = setTimeout(() => setSavedPulse(false), 3000);
      return () => clearTimeout(t);
    }
  }, [currentSessionId]);

  // Sort charts, apply selection filter, then apply feature-visibility filter
  const sortedCharts = useMemo(() => {
    if (!blueprint) return [];
    let charts = sortCharts(blueprint.charts);
    if (selectedChartIds.length > 0) {
      charts = charts.filter((c) => selectedChartIds.includes(c.chartId));
    }
    if (hiddenFeatures.size === 0) return charts;
    return charts.filter((chart) => {
      const cols = [chart.xAxis, chart.yAxis, chart.groupBy, chart.colorBy].filter(
        (c): c is string => Boolean(c)
      );
      return cols.length === 0 || !cols.every((c) => hiddenFeatures.has(c));
    });
  }, [blueprint, selectedChartIds, hiddenFeatures]);

  const toggleFeature = (col: string) => {
    setHiddenFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  // Download vizReadyRows as CSV via papaparse
  const handleDownloadCSV = async () => {
    if (!vizReadyRows?.length) return;
    setDownloading(true);
    try {
      const { default: Papa } = await import("papaparse") as {
        default: { unparse: (data: Record<string, unknown>[]) => string };
      };
      const csv = Papa.unparse(vizReadyRows as Record<string, unknown>[]);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${
        (blueprint?.dashboardTitle ?? "cleaned_data")
          .replace(/[^a-z0-9]+/gi, "_")
          .toLowerCase()
      }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!blueprint || !vizReadyRows) return null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-2 px-4">

          {/* Sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>

          {/* Brand */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <BarChart2 className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">DataViz AI</span>
          </Link>

          {/* Separator */}
          <div className="h-4 w-px bg-border" />

          {/* Nav icons */}
          <div className="flex items-center gap-0.5">
            <NavIconButton href="/" title="Home">
              <Home className="h-4 w-4" />
            </NavIconButton>
            <NavIconButton href="/upload" title="New Dashboard">
              <Upload className="h-4 w-4" />
            </NavIconButton>
            <NavIconButton href="/history" title="My Dashboards">
              <History className="h-4 w-4" />
            </NavIconButton>
          </div>

          {/* Separator */}
          <div className="h-4 w-px bg-border" />

          {/* Title + narrative */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">
              {blueprint.dashboardTitle}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {shortNarrative(blueprint.dashboardNarrative)}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Save status */}
            {isSaving && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                Saving…
              </span>
            )}
            {savedPulse && !isSaving && (
              <span className="text-xs text-emerald-500">✓ Saved</span>
            )}

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Database className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Data Summary</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Mobile backdrop */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="fixed bottom-0 left-0 top-14 z-40 overflow-hidden border-r border-border bg-background md:relative md:bottom-auto md:left-auto md:top-auto md:z-auto md:shrink-0"
            >
              <div className="h-full w-72 overflow-y-auto p-4">
                <FilterPanel />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Chart grid */}
        <main className="flex-1 overflow-y-auto p-4">
          {sortedCharts.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                No charts to display. Try adjusting filters or re-enabling hidden features.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedCharts.map((chart, index) => {
                const effectiveType = (chartTypeOverrides[chart.chartId] ?? chart.chartType) as ChartType;
                const rendered = renderChart(chart, vizReadyRows, effectiveType);
                if (!rendered) return null;
                return (
                  <ChartAnimationDelay.Provider
                    key={chart.chartId}
                    value={index * 0.08}
                  >
                    <ChartWrapper
                      chartId={chart.chartId}
                      chartType={effectiveType}
                    >
                      <ChartErrorBoundary title={chart.title}>
                        {rendered}
                      </ChartErrorBoundary>
                    </ChartWrapper>
                  </ChartAnimationDelay.Provider>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── Data Summary Sheet ───────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetHeader onClose={() => setSheetOpen(false)}>
          <SheetTitle>Data Summary</SheetTitle>
          <SheetDescription>
            Cleaning operations applied and features engineered for this dashboard.
          </SheetDescription>
        </SheetHeader>

        <SheetContent>
          <div className="space-y-8">

            {/* Download button */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownloadCSV}
              disabled={downloading || !vizReadyRows?.length}
            >
              {downloading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download Cleaned Data (.csv)
                </>
              )}
            </Button>

            {/* Dashboard Overview */}
            {blueprint.dashboardNarrative && (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Dashboard Overview
                  </p>
                </div>
                <p className="text-sm italic leading-relaxed text-foreground/80">
                  {blueprint.dashboardNarrative}
                </p>
              </div>
            )}

            {/* Cleaning diff */}
            {diffSummary && (
              <section>
                <SectionHeading icon={<Trash2 className="h-4 w-4" />}>
                  What was cleaned
                </SectionHeading>

                <div className="space-y-2">
                  {diffSummary.duplicatesRemoved > 0 && (
                    <DiffRow
                      label="Duplicates removed"
                      value={diffSummary.duplicatesRemoved.toLocaleString()}
                    />
                  )}
                  {diffSummary.droppedColumns.length > 0 && (
                    <DiffRow
                      label="Dropped columns"
                      value={diffSummary.droppedColumns.join(", ")}
                    />
                  )}
                  {diffSummary.imputedColumns.map((ic) => (
                    <DiffRow
                      key={ic.column}
                      label={`Imputed "${ic.column}" (${ic.strategy})`}
                      value={`${ic.count.toLocaleString()} values`}
                    />
                  ))}
                  {diffSummary.outliersHandled.map((oh) => (
                    <DiffRow
                      key={oh.column}
                      label={`Capped outliers in "${oh.column}"`}
                      value={`${oh.count.toLocaleString()} values`}
                    />
                  ))}
                </div>

                {diffSummary.distributionWarnings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {diffSummary.distributionWarnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Engineered features */}
            {engineeredMeta && engineeredMeta.engineeredFeatures.length > 0 && (
              <section>
                <SectionHeading icon={<Wand2 className="h-4 w-4" />}>
                  Engineered Features
                </SectionHeading>
                <p className="mb-4 text-xs text-muted-foreground">
                  Toggle off to hide charts that rely on that feature.
                </p>

                <div className="space-y-3">
                  {engineeredMeta.engineeredFeatures.map((feat) => (
                    <div
                      key={feat.newColumnName}
                      className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <code className="text-sm font-medium">
                          {feat.newColumnName}
                        </code>
                        <Switch
                          checked={!hiddenFeatures.has(feat.newColumnName)}
                          onCheckedChange={() => toggleFeature(feat.newColumnName)}
                        />
                      </div>

                      <p className="mb-2 text-xs text-muted-foreground">
                        {feat.reason}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        <Pill>{feat.technique}</Pill>
                        <Pill muted>{feat.formula}</Pill>
                      </div>

                      {feat.sourceColumns.length > 0 && (
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          From:{" "}
                          <span className="font-medium">
                            {feat.sourceColumns.join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal UI helpers (file-private)
// ---------------------------------------------------------------------------

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  );
}

function DiffRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Pill({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={
        muted
          ? "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          : "rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
      }
    >
      {children}
    </span>
  );
}

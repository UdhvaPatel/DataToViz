"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, AlertCircle, RotateCcw, HelpCircle, ArrowRight,
  BarChart2, TrendingUp, ScatterChart, PieChart, Activity,
  Grid, Layers, Filter, Minus, LayoutGrid,
  LineChart, BarChart, CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { resumePipeline } from "@/lib/data/pipeline";
import { saveSession, updateChartUsage } from "@/lib/supabase/sessions";
import { chartAlternatives } from "@/lib/viz/chartCompatibility";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineStatus } from "@/lib/store/pipelineStore";
import type { ChartBlueprint, ChartType, ChartRelevance } from "@/types/data";

// ---------------------------------------------------------------------------
// Stage definitions — ordered to match pipeline execution
// ---------------------------------------------------------------------------

interface Stage {
  status: PipelineStatus;
  label: string;
  desc: string;
}

const STAGES: Stage[] = [
  { status: "profiling",       label: "Profiling Data",       desc: "Parsing your file and building a column profile" },
  { status: "sampling",        label: "Sampling",             desc: "Building a representative context package" },
  { status: "understanding",   label: "Understanding Data",   desc: "Identifying column roles and cleaning strategy" },
  { status: "cleaning",        label: "Cleaning",             desc: "Imputing missing values, capping outliers" },
  { status: "prompt",          label: "Reading Prompt",       desc: "Extracting intent, entities, and focus areas" },
  { status: "engineering",     label: "Engineering Features", desc: "Generating derived columns and transformations" },
  { status: "eda",             label: "EDA",                  desc: "Computing distributions and correlations" },
  { status: "blueprint",       label: "Building Blueprint",   desc: "Designing your optimal dashboard layout" },
  { status: "chart_selection", label: "Choose Your Charts",   desc: "Select which charts to include in your dashboard" },
  { status: "ready",           label: "Ready",                desc: "Your dashboard is ready to view" },
];

const STATUS_INDEX: Partial<Record<PipelineStatus, number>> = {
  profiling: 0, sampling: 1, understanding: 2, cleaning: 3,
  prompt: 4, engineering: 5, eda: 6, blueprint: 7,
  chart_selection: 8, ready: 9,
};

type StepState = "pending" | "active" | "paused" | "complete" | "error";

function getStepState(
  stageIdx: number,
  currentStatus: PipelineStatus,
  errorAtIdx: number | null,
  pausedAtIdx: number | null
): StepState {
  if (currentStatus === "error" && errorAtIdx !== null) {
    if (stageIdx < errorAtIdx) return "complete";
    if (stageIdx === errorAtIdx) return "error";
    return "pending";
  }

  const cur = STATUS_INDEX[currentStatus] ?? 0;
  if (stageIdx < cur) return "complete";
  if (stageIdx === cur) {
    if (pausedAtIdx !== null && stageIdx === pausedAtIdx) return "paused";
    return "active";
  }
  return "pending";
}

// ---------------------------------------------------------------------------
// Step icon
// ---------------------------------------------------------------------------

function StepIcon({ state }: { state: StepState }) {
  return (
    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
      <AnimatePresence mode="wait">
        {state === "complete" && (
          <motion.div
            key="complete"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500"
          >
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </motion.div>
        )}

        {state === "active" && (
          <motion.div
            key="active"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary bg-primary/10"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="absolute inset-0 animate-ping rounded-full border border-primary/50 [animation-duration:1.8s]" />
          </motion.div>
        )}

        {state === "paused" && (
          <motion.div
            key="paused"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-violet-500 bg-violet-500/10"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-violet-500" />
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive"
          >
            <X className="h-3.5 w-3.5 text-destructive-foreground" strokeWidth={2.5} />
          </motion.div>
        )}

        {state === "pending" && (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-7 w-7 rounded-full border-2 border-border bg-muted"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart type helpers
// ---------------------------------------------------------------------------

const CHART_TYPE_ICONS: Record<ChartType, React.ReactNode> = {
  bar:       <BarChart2 className="h-3.5 w-3.5" />,
  line:      <TrendingUp className="h-3.5 w-3.5" />,
  scatter:   <ScatterChart className="h-3.5 w-3.5" />,
  pie:       <PieChart className="h-3.5 w-3.5" />,
  donut:     <PieChart className="h-3.5 w-3.5" />,
  histogram: <Activity className="h-3.5 w-3.5" />,
  heatmap:   <Grid className="h-3.5 w-3.5" />,
  bubble:    <Layers className="h-3.5 w-3.5" />,
  funnel:    <Filter className="h-3.5 w-3.5" />,
};

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "Bar Chart", line: "Line Chart", scatter: "Scatter Plot",
  pie: "Pie Chart", donut: "Donut Chart", histogram: "Histogram",
  heatmap: "Heatmap", bubble: "Bubble Chart", funnel: "Funnel Chart",
};

const ALT_ICONS: Record<string, React.ReactNode> = {
  bar:       <BarChart2 className="h-3 w-3" />,
  line:      <LineChart className="h-3 w-3" />,
  scatter:   <ScatterChart className="h-3 w-3" />,
  pie:       <PieChart className="h-3 w-3" />,
  donut:     <PieChart className="h-3 w-3" />,
  histogram: <BarChart className="h-3 w-3" />,
  heatmap:   <LayoutGrid className="h-3 w-3" />,
  bubble:    <CircleDot className="h-3 w-3" />,
  funnel:    <Filter className="h-3 w-3" />,
};

const RELEVANCE_COLORS: Record<ChartRelevance, string> = {
  high:        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  medium:      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  exploratory: "bg-muted text-muted-foreground border-border",
};

const RELEVANCE_ORDER: Record<ChartRelevance, number> = { high: 0, medium: 1, exploratory: 2 };

function sortedBlueprint(charts: ChartBlueprint[]): ChartBlueprint[] {
  return [...charts].sort(
    (a, b) => RELEVANCE_ORDER[a.relevance] - RELEVANCE_ORDER[b.relevance] || a.order - b.order
  );
}

// ---------------------------------------------------------------------------
// Chart selection card
// ---------------------------------------------------------------------------

function ChartSelectionCard({ charts }: { charts: ChartBlueprint[] }) {
  const store = usePipelineStore();
  const setSelectedChartIds   = store.setSelectedChartIds;
  const setPipelineStatus     = store.setPipelineStatus;
  const setDashboardBlueprint = store.setDashboardBlueprint;
  const setCurrentSessionId   = store.setCurrentSessionId;
  const userPrompt            = store.userPrompt;
  const uploadedFile          = store.uploadedFile;
  const dataProfile           = store.dataProfile;
  const vizReadyRows          = store.vizReadyRows;
  const engineeredMeta        = store.engineeredMeta;
  const dashboardBlueprint    = store.dashboardBlueprint;
  const router = useRouter();

  // Resolve auth user locally — Navbar may not be mounted on this page
  const [user, setUser] = useState<User | null>(store.user);
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data, error }) => {
      console.log('[Processing] getUser result:', data?.user?.id, error)
      setUser(data?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Processing] Auth state change:', event, session?.user?.id)
        setUser(session?.user ?? null)
      }
    )
    return () => subscription.unsubscribe()
  }, []);

  const sorted = sortedBlueprint(charts);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sorted.map((c) => c.chartId))
  );
  const [chartTypeOverrides, setChartTypeOverrides] = useState<Record<string, string>>({});
  const [shake, setShake] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    console.log('[handleContinue] user:', user)
    console.log('[handleContinue] user.id:', user?.id)

    if (selected.size === 0) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    const selectedCharts = sorted.filter((c) => selected.has(c.chartId));
    const filteredBlueprint = {
      ...dashboardBlueprint!,
      charts: selectedCharts.map((c) => ({
        ...c,
        chartType: (chartTypeOverrides[c.chartId] ?? c.chartType) as ChartType,
      })),
    };

    setDashboardBlueprint(filteredBlueprint);
    setSelectedChartIds([...selected]);
    setPipelineStatus("ready");

    if (user?.id) {
      saveSession(user.id, {
        userPrompt,
        datasetFilename: uploadedFile?.name ?? "unknown",
        datasetRowCount: dataProfile?.rowCount ?? vizReadyRows?.length ?? 0,
        datasetColCount: dataProfile?.columnCount ?? 0,
        vizReadyRows: vizReadyRows ?? [],
        engineeredMeta: engineeredMeta!,
        dashboardBlueprint: filteredBlueprint,
        selectedChartIds: [...selected],
      }).then((id) => {
        if (id) setCurrentSessionId(id);
      });
      updateChartUsage(user.id, filteredBlueprint.charts);
    }

    router.push("/dashboard");
  };

  const allSelected = selected.size === sorted.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sorted.map((c) => c.chartId)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="ml-10 mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">
            {sorted.length} charts recommended
          </p>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Choose which charts to include. You can always adjust this from the dashboard.
      </p>

      <div className="mb-4 space-y-2">
        {sorted.map((chart) => {
          const isChecked = selected.has(chart.chartId);
          const activeType = chartTypeOverrides[chart.chartId] ?? chart.chartType;
          const alts = (chartAlternatives[chart.chartType] ?? []).slice(0, 3);

          return (
            <div key={chart.chartId} className="space-y-1.5">
              <button
                onClick={() => toggle(chart.chartId)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  isChecked
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                {/* Checkbox */}
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isChecked
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-border bg-background"
                  )}
                >
                  {isChecked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {CHART_TYPE_ICONS[activeType as ChartType] ?? CHART_TYPE_ICONS[chart.chartType]}
                    </span>
                    <span className="truncate text-xs font-medium text-foreground">
                      {chart.title}
                    </span>
                    {chartTypeOverrides[chart.chartId] && (
                      <span className="shrink-0 text-[9px] text-violet-500">
                        ({CHART_TYPE_LABELS[activeType] ?? activeType})
                      </span>
                    )}
                  </div>
                  {chart.xAxis && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {chart.xAxis}{chart.yAxis ? ` × ${chart.yAxis}` : ""}
                    </p>
                  )}
                </div>

                {/* Relevance badge */}
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                    RELEVANCE_COLORS[chart.relevance]
                  )}
                >
                  {chart.relevance}
                </span>
              </button>

              {/* Alternative type pills */}
              {alts.length > 0 && (
                <div className="flex items-center gap-1.5 pl-7">
                  <span className="text-[10px] text-muted-foreground">Also works as:</span>
                  {alts.map((alt) => {
                    const isActive = activeType === alt;
                    return (
                      <button
                        key={alt}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChartTypeOverrides((prev) => ({
                            ...prev,
                            [chart.chartId]: isActive ? chart.chartType : alt,
                          }));
                        }}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                          isActive
                            ? "border-violet-500/50 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                            : "border-border bg-background text-muted-foreground hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-foreground"
                        )}
                      >
                        {ALT_ICONS[alt]}
                        {CHART_TYPE_LABELS[alt] ?? alt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <motion.div
        animate={shake ? { x: [0, -6, 6, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Button className="w-full gap-2" onClick={handleContinue}>
          {selected.size === 0 ? (
            <>
              <Minus className="h-4 w-4" />
              Select at least one chart
            </>
          ) : (
            <>
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </motion.div>

      {selected.size > 0 && selected.size < sorted.length && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {selected.size} of {sorted.length} charts selected
        </p>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Clarifying questions card
// ---------------------------------------------------------------------------

function ClarifyingQuestionsCard({
  questions,
  originalPrompt,
}: {
  questions: string[];
  originalPrompt: string;
}) {
  const [value, setValue] = useState(originalPrompt);
  const [resuming, setResuming] = useState(false);

  const handleContinue = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setResuming(true);
    try {
      await resumePipeline(trimmed);
    } finally {
      setResuming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="ml-10 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Clarification needed
        </p>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Your prompt was ambiguous. Please answer these questions and update your
        prompt below so we can build the right dashboard.
      </p>

      <ul className="mb-4 space-y-1.5">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span className="shrink-0 font-medium text-amber-600 dark:text-amber-400">
              {i + 1}.
            </span>
            <span className="text-foreground">{q}</span>
          </li>
        ))}
      </ul>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="mb-3 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring"
        placeholder="Write a clarified prompt that addresses the questions above…"
      />

      <Button
        className="w-full gap-2"
        onClick={handleContinue}
        disabled={resuming || !value.trim()}
      >
        {resuming ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Resuming…
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-semibold text-destructive">Pipeline error</p>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" className="w-full gap-2" onClick={onRetry}>
        <RotateCcw className="h-3.5 w-3.5" />
        Try Again
      </Button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProcessingPage() {
  const router = useRouter();

  useEffect(() => {
    document.title = "Processing · DataToViz";
  }, []);

  const status              = usePipelineStore((s) => s.pipelineStatus);
  const pipelineError       = usePipelineStore((s) => s.pipelineError);
  const clarifyingQuestions = usePipelineStore((s) => s.clarifyingQuestions);
  const userPrompt          = usePipelineStore((s) => s.userPrompt);
  const dashboardBlueprint  = usePipelineStore((s) => s.dashboardBlueprint);
  const dataProfile         = usePipelineStore((s) => s.dataProfile);
  const uploadedFile        = usePipelineStore((s) => s.uploadedFile);

  // ── Display status with 800ms delay between transitions ───────────────────
  const [displayStatus, setDisplayStatus] = useState<PipelineStatus>(status);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Errors and idle always show immediately
    if (status === "error" || status === "idle") {
      if (delayTimer.current) clearTimeout(delayTimer.current);
      setDisplayStatus(status);
      return;
    }
    // All other transitions get an 800ms visual pause
    if (delayTimer.current) clearTimeout(delayTimer.current);
    delayTimer.current = setTimeout(() => {
      setDisplayStatus(status);
    }, 800);
    return () => {
      if (delayTimer.current) clearTimeout(delayTimer.current);
    };
  }, [status]);

  const lastActiveRef = useRef<number>(0);
  useEffect(() => {
    const idx = STATUS_INDEX[displayStatus];
    if (idx !== undefined) lastActiveRef.current = idx;
  }, [displayStatus]);

  useEffect(() => {
    if (status === "idle") router.replace("/upload");
  }, [status, router]);

  // Auto-navigate when pipeline reaches ready (set by ChartSelectionCard)
  useEffect(() => {
    if (status === "ready") router.push("/dashboard");
  }, [status, router]);

  const isPausedForClarify    = displayStatus === "prompt" && clarifyingQuestions.length > 0;
  const isPausedForSelection  = displayStatus === "chart_selection";
  const isErrored             = displayStatus === "error";
  const errorAtIdx            = isErrored ? lastActiveRef.current : null;

  const pausedAtIdx = isPausedForClarify
    ? STATUS_INDEX["prompt"] ?? null
    : isPausedForSelection
      ? STATUS_INDEX["chart_selection"] ?? null
      : null;

  const isLargeFile =
    (dataProfile?.rowCount ?? 0) > 5000 ||
    (uploadedFile?.size ?? 0) > 5 * 1024 * 1024;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold">
            {isErrored
              ? "Something went wrong"
              : isPausedForSelection
                ? "Choose your charts"
                : isPausedForClarify
                  ? "One quick question…"
                  : "Building your dashboard"}
          </h1>
          {!isErrored && !isPausedForClarify && !isPausedForSelection && (
            <p className="mt-1 text-sm text-muted-foreground">
              {isLargeFile ? "Large file detected — this may take up to a minute" : "Usually takes 15–30 seconds"}
            </p>
          )}
          {isPausedForSelection && (
            <p className="mt-1 text-sm text-muted-foreground">
              Pick the charts you want in your dashboard
            </p>
          )}
        </div>

        {/* ── Vertical stepper ─────────────────────────────────────────── */}
        <div>
          {STAGES.map((stage, index) => {
            const state = getStepState(index, displayStatus, errorAtIdx, pausedAtIdx);
            const isLast = index === STAGES.length - 1;

            return (
              <div key={stage.status}>
                <div className="flex gap-3">
                  {/* Left: icon + connector */}
                  <div className="flex flex-col items-center">
                    <StepIcon state={state} />
                    {!isLast && (
                      <div
                        className={cn(
                          "mt-1 w-px flex-1 transition-colors duration-500",
                          state === "complete"
                            ? "bg-emerald-500/50"
                            : "bg-border"
                        )}
                        style={{ minHeight: "1.5rem" }}
                      />
                    )}
                  </div>

                  {/* Right: label + description */}
                  <div className={cn("flex-1 pb-5", isLast && "pb-0")}>
                    <p
                      className={cn(
                        "pt-0.5 text-sm font-medium leading-none transition-colors",
                        state === "active"  && "text-foreground",
                        state === "paused"  && stage.status === "prompt"
                          ? "text-amber-600 dark:text-amber-400"
                          : state === "paused"
                            ? "text-violet-600 dark:text-violet-400"
                            : "",
                        state === "complete" && "text-foreground",
                        state === "error"   && "text-destructive",
                        state === "pending" && "text-muted-foreground"
                      )}
                    >
                      {stage.label}
                    </p>

                    <AnimatePresence>
                      {(state === "active" || state === "paused") && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-0.5 overflow-hidden text-xs text-muted-foreground"
                        >
                          {stage.desc}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Clarifying questions — below the "prompt" step */}
                <AnimatePresence>
                  {stage.status === "prompt" && isPausedForClarify && (
                    <ClarifyingQuestionsCard
                      key="clarify"
                      questions={clarifyingQuestions}
                      originalPrompt={userPrompt}
                    />
                  )}
                </AnimatePresence>

                {/* Chart selection — below the "chart_selection" step */}
                <AnimatePresence>
                  {stage.status === "chart_selection" && isPausedForSelection && dashboardBlueprint && (
                    <ChartSelectionCard
                      key="chart-select"
                      charts={dashboardBlueprint.charts}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* ── Error card ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {isErrored && pipelineError && (
            <ErrorCard
              key="error"
              message={pipelineError}
              onRetry={() => router.replace("/upload")}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StickyNote, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RELEVANCE_BADGE } from "@/lib/viz/colors";
import { useAnnotationStore } from "@/lib/store/annotationStore";
import { cn } from "@/lib/utils";
import type { ChartRelevance } from "@/types/data";

/**
 * Provide a numeric delay (seconds) to stagger chart entrance animations.
 * The dashboard page wraps each chart with this context.
 */
export const ChartAnimationDelay = createContext(0);

interface ChartCardProps {
  title: string;
  narrative: string;
  relevance: ChartRelevance;
  children: React.ReactNode;
  className?: string;
  chartId?: string;
}

export function ChartCard({
  title,
  narrative,
  relevance,
  children,
  className,
  chartId,
}: ChartCardProps) {
  const delay = useContext(ChartAnimationDelay);
  const badge = RELEVANCE_BADGE[relevance];

  // Show a skeleton placeholder during the stagger delay period so the grid
  // isn't empty while later charts are waiting to animate in.
  const [showSkeleton, setShowSkeleton] = useState(delay > 0);
  useEffect(() => {
    if (!showSkeleton) return;
    const id = setTimeout(() => setShowSkeleton(false), delay * 1000);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Annotation popover state
  const [noteOpen, setNoteOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const note = useAnnotationStore((s) =>
    chartId ? (s.notes[chartId] ?? "") : ""
  );
  const setNote = useAnnotationStore((s) => s.setNote);

  useEffect(() => {
    if (!noteOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setNoteOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [noteOpen]);

  if (showSkeleton) return <ChartCardSkeleton />;

  const variants = {
    hidden: { opacity: 0, y: 16 },
    // No framer-motion delay — the skeleton already handled timing for staggered charts.
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold leading-snug">
              {title}
            </CardTitle>

            <div className="flex shrink-0 items-center gap-1">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>

              {/* Annotation button — only shown when chartId is provided */}
              {chartId && (
                <div className="relative" ref={popoverRef}>
                  <button
                    type="button"
                    title={note ? "Edit annotation" : "Add annotation"}
                    onClick={() => setNoteOpen((o) => !o)}
                    className={cn(
                      "relative rounded p-1 transition-colors hover:bg-accent",
                      note
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {note && (
                      <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-background" />
                    )}
                  </button>

                  <AnimatePresence>
                    {noteOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-popover p-3 shadow-lg"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">
                            Annotation
                          </p>
                          <button
                            type="button"
                            onClick={() => setNoteOpen(false)}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>

                        <textarea
                          value={note}
                          onChange={(e) => setNote(chartId, e.target.value)}
                          placeholder="Add a note about this chart…"
                          rows={3}
                          autoFocus
                          className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring"
                        />

                        {note && (
                          <button
                            type="button"
                            onClick={() => {
                              setNote(chartId, "");
                              setNoteOpen(false);
                            }}
                            className="mt-1 text-[10px] text-destructive hover:underline"
                          >
                            Clear note
                          </button>
                        )}

                        {/* Saved note preview — shown below textarea as read-only reminder */}
                        {note && (
                          <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                            Auto-saved to browser storage
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {narrative}
          </p>
        </CardHeader>

        <CardContent className="pb-4">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder — shown while a chart waits for its stagger delay
// ---------------------------------------------------------------------------

export function ChartCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </CardHeader>
      <CardContent className="pb-4">
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state — shown inside ChartCard when data is missing or invalid
// ---------------------------------------------------------------------------

export function EmptyChart({ message = "No data available" }: { message?: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-border">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

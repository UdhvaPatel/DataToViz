"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  FileJson,
  X,
  BarChart3,
  Sparkles,
  AlertCircle,
  Home,
  History,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runPipeline } from "@/lib/data/pipeline";
import { Navbar } from "@/components/layout/Navbar";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { updateLastActive } from "@/lib/supabase/auth";
import { useTheme } from "@/lib/hooks/useTheme";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPTED_EXTS = ["csv", "xlsx", "xls", "json"];
const ACCEPTED_ATTR = ".csv,.xlsx,.xls,.json";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "json") return <FileJson className="h-5 w-5 text-amber-400" />;
  if (ext === "csv") return <FileText className="h-5 w-5 text-emerald-400" />;
  return <FileSpreadsheet className="h-5 w-5 text-blue-400" />;
}

const EXAMPLE_PROMPTS = [
  "Monthly revenue trends by region",
  "Top products by profit margin",
  "Customer churn by segment",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const user = usePipelineStore((s) => s.user);
  const { isDark, toggle: toggleTheme } = useTheme();

  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(searchParams.get("prompt") ?? "");

  useEffect(() => {
    document.title = "Upload · DataToViz";
  }, []);

  useEffect(() => {
    if (user?.id) updateLastActive(user.id);
  }, [user?.id]);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<{ file?: string; prompt?: string }>({});

  // Accept and validate a dropped / selected file
  const acceptFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTS.includes(ext)) {
      setErrors((e) => ({
        ...e,
        file: "Only CSV, Excel (.xlsx / .xls), and JSON files are supported.",
      }));
      return;
    }
    setErrors((e) => ({ ...e, file: undefined }));
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) acceptFile(f);
    },
    [acceptFile]
  );

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!file) next.file = "Please upload a data file to continue.";
    if (!prompt.trim()) next.prompt = "Please describe what you'd like to visualize.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    // Fire the pipeline (async, store-driven) then navigate immediately.
    // /processing reads pipelineStatus from Zustand to show progress.
    runPipeline(file!, prompt.trim());
    router.push("/processing");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      {/* Sub-nav with quick links */}
      <div className="flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </Link>
        <Link
          href="/history"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
          My Dashboards
        </Link>
        <div className="ml-auto">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-lg space-y-7"
      >
        {/* ── Brand header ─────────────────────────────────────────────── */}
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-primary/10 p-3.5">
            <BarChart3 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DataToViz</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your data, describe what matters — get a live dashboard in seconds.
            </p>
          </div>
        </div>

        {/* ── File drop zone ───────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_ATTR}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
              e.target.value = ""; // allow re-selecting same file
            }}
          />

          <motion.div
            animate={dragging ? { scale: 1.015 } : { scale: 1 }}
            transition={{ duration: 0.15 }}
            onClick={() => !file && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => {
              // Ignore events that fire on child elements
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragging(false);
              }
            }}
            onDrop={onDrop}
            className={cn(
              "relative rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              !file && "cursor-pointer",
              dragging
                ? "border-primary bg-primary/5"
                : errors.file
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <AnimatePresence mode="wait">
              {file ? (
                /* ── File selected state ──────────────────────────────── */
                <motion.div
                  key="file"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center justify-between gap-4 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileTypeIcon name={file.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setErrors((err) => ({ ...err, file: undefined }));
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              ) : (
                /* ── Empty / drag state ───────────────────────────────── */
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-3"
                >
                  <Upload
                    className={cn(
                      "mx-auto h-9 w-9 transition-colors",
                      dragging ? "text-primary" : "text-muted-foreground/50"
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {dragging
                        ? "Release to upload"
                        : "Drop your file here or "}
                      {!dragging && (
                        <span className="text-primary underline-offset-2 hover:underline">
                          browse
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      CSV · Excel (.xlsx / .xls) · JSON
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {errors.file && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 text-xs text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {errors.file}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* ── Prompt textarea ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <label htmlFor="prompt" className="text-sm font-medium">
            What do you want to explore?
          </label>

          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (errors.prompt && e.target.value.trim()) {
                setErrors((err) => ({ ...err, prompt: undefined }));
              }
            }}
            placeholder="e.g. Show me monthly revenue trends by region, identify which products drive the most profit, and flag any seasonal spikes."
            rows={4}
            className={cn(
              "w-full resize-none rounded-lg border bg-background px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground/50 transition-shadow focus:ring-2",
              errors.prompt
                ? "border-destructive focus:ring-destructive/30"
                : "border-input focus:ring-ring"
            )}
          />

          {/* Example prompt chips */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setPrompt(ex);
                  setErrors((err) => ({ ...err, prompt: undefined }));
                }}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                {ex}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {errors.prompt && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 text-xs text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {errors.prompt}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <Button className="w-full gap-2" size="lg" onClick={handleSubmit}>
          <Sparkles className="h-4 w-4" />
          Build Dashboard
        </Button>
      </motion.div>
    </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadContent />
    </Suspense>
  );
}

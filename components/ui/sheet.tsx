"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Sheet — bottom-slide drawer built with framer-motion
// ---------------------------------------------------------------------------

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  // Scroll-lock the body while the sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex shrink-0 justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Composable sub-components
// ---------------------------------------------------------------------------

export function SheetHeader({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between border-b border-border px-6 pb-4 pt-2",
        className
      )}
    >
      <div className="flex-1">{children}</div>
      <button
        type="button"
        onClick={onClose}
        className="ml-4 mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
    </div>
  );
}

export function SheetTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
      {children}
    </h2>
  );
}

export function SheetDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-1 text-sm text-muted-foreground", className)}>{children}</p>
  );
}

export function SheetContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-6 py-4", className)}>{children}</div>
  );
}

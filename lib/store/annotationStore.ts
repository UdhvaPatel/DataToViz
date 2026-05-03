import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AnnotationState {
  notes: Record<string, string>;
  setNote: (chartId: string, note: string) => void;
  clearNote: (chartId: string) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set) => ({
      notes: {},

      setNote: (chartId, note) =>
        set((s) => ({ notes: { ...s.notes, [chartId]: note } })),

      clearNote: (chartId) =>
        set((s) => {
          const notes = { ...s.notes };
          delete notes[chartId];
          return { notes };
        }),
    }),
    { name: "dtv-annotations" }
  )
);

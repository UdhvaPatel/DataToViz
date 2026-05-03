"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  Calendar,
  Database,
  Trash2,
  Play,
  LayoutDashboard,
  Clock,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { getUserSessions, deleteSession, getSessionById } from "@/lib/supabase/sessions";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@/types/supabase";
import type { DashboardBlueprint, EngineeringMeta } from "@/types/data";
import type { Rows } from "@/lib/store/pipelineStore";

const PAGE    = "#09090b";
const CARD    = "#18181b";
const BORDER  = "#27272a";
const TEXT    = "#fafafa";
const MUTED   = "#71717a";
const ACCENT  = "#7c3aed";
const ACCENTL = "#8b5cf6";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPage() {
  const router = useRouter();
  const user = usePipelineStore((s) => s.user);
  const setVizReadyRows = usePipelineStore((s) => s.setVizReadyRows);
  const setEngineeredMeta = usePipelineStore((s) => s.setEngineeredMeta);
  const setDashboardBlueprint = usePipelineStore((s) => s.setDashboardBlueprint);
  const setSelectedChartIds = usePipelineStore((s) => s.setSelectedChartIds);
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const setCurrentSessionId = usePipelineStore((s) => s.setCurrentSessionId);
  const setUserPrompt = usePipelineStore((s) => s.setUserPrompt);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [favoriteChart, setFavoriteChart] = useState<string>("—");
  const [lastActiveStr, setLastActiveStr] = useState<string>("—");

  useEffect(() => {
    document.title = "History · DataToViz";
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    getUserSessions(user.id).then((data) => {
      setSessions(data);
      setLoading(false);

      if (data.length > 0) {
        setLastActiveStr(timeAgo(data[0].created_at));
      }
    });

    // Fetch favorite chart type
    const supabase = createClient();
    supabase
      .from("chart_usage")
      .select("chart_type, use_count")
      .eq("user_id", user.id)
      .order("use_count", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.chart_type) {
          setFavoriteChart(
            data.chart_type.charAt(0).toUpperCase() + data.chart_type.slice(1)
          );
        }
      });
  }, [user]);

  async function handleRestore(sessionId: string) {
    setRestoringId(sessionId);
    try {
      const session = await getSessionById(sessionId);
      if (!session) return;

      setVizReadyRows((session.viz_ready_rows as Rows) ?? []);
      setEngineeredMeta(session.engineered_meta as unknown as EngineeringMeta);
      setDashboardBlueprint(session.dashboard_blueprint as unknown as DashboardBlueprint);
      setSelectedChartIds(session.selected_chart_ids ?? []);
      setUserPrompt(session.user_prompt);
      setCurrentSessionId(session.id);
      setPipelineStatus("ready");

      router.push("/dashboard");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(sessionId: string) {
    setDeletingId(sessionId);
    const ok = await deleteSession(sessionId);
    if (ok) setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  const totalDashboards = sessions.length;

  return (
    <div style={{ background: PAGE, color: TEXT, minHeight: "100vh" }}>
      <Navbar />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: "0.375rem" }}>
            My Dashboards
          </h1>
          <p style={{ color: MUTED, fontSize: "0.875rem" }}>
            Restore or re-run any previous analysis.
          </p>
        </div>

        {/* Stats strip */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}>
          {[
            { icon: LayoutDashboard, label: "Total Dashboards", value: String(totalDashboards) },
            { icon: BarChart2,       label: "Favorite Chart",   value: favoriteChart },
            { icon: Database,        label: "Analyses Run",     value: String(totalDashboards) },
            { icon: Clock,           label: "Last Active",      value: lastActiveStr },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: "0.625rem",
                padding: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <Icon size={14} style={{ color: ACCENTL }} />
                <p style={{ color: MUTED, fontSize: "0.75rem", fontWeight: 500 }}>{label}</p>
              </div>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Sessions list */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
            <div style={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", border: `2px solid ${BORDER}`, borderTopColor: ACCENTL, animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: MUTED }}>
            <LayoutDashboard size={40} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontSize: "0.9375rem", fontWeight: 500 }}>No dashboards yet</p>
            <p style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>Upload a dataset to create your first dashboard.</p>
            <button
              onClick={() => router.push("/upload")}
              style={{
                marginTop: "1.25rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "0.5rem",
                border: "none",
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENTL})`,
                color: TEXT,
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              New Analysis
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <AnimatePresence>
              {sessions.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  style={{
                    background: CARD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: "0.75rem",
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    {/* Left: info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <p style={{ fontWeight: 600, fontSize: "0.9375rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {session.dashboard_title}
                        </p>
                        {session.truncated_for_storage && (
                          <span style={{ fontSize: "0.6875rem", color: MUTED, background: "#27272a", borderRadius: 99, padding: "1px 7px", flexShrink: 0 }}>
                            Preview
                          </span>
                        )}
                      </div>
                      <p style={{ color: MUTED, fontSize: "0.8125rem", marginBottom: "0.75rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {session.user_prompt}
                      </p>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                        {[
                          { icon: Database,  text: session.file_name },
                          { icon: BarChart2, text: `${session.chart_count} charts` },
                          { icon: Calendar,  text: timeAgo(session.created_at) },
                        ].map(({ icon: Icon, text }) => (
                          <span key={text} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: MUTED }}>
                            <Icon size={11} />
                            {text}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        onClick={() => router.push(`/upload?prompt=${encodeURIComponent(session.user_prompt)}`)}
                        title="Re-run with same prompt"
                        style={{
                          padding: "0.4rem 0.75rem",
                          borderRadius: "0.375rem",
                          border: `1px solid ${BORDER}`,
                          background: "transparent",
                          color: MUTED,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <Play size={11} />
                        Re-run
                      </button>

                      {session.viz_ready_rows !== null && (
                        <button
                          onClick={() => handleRestore(session.id)}
                          disabled={restoringId === session.id}
                          style={{
                            padding: "0.4rem 0.875rem",
                            borderRadius: "0.375rem",
                            border: "none",
                            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENTL})`,
                            color: TEXT,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: restoringId === session.id ? "not-allowed" : "pointer",
                            opacity: restoringId === session.id ? 0.6 : 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          {restoringId === session.id ? (
                            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.3)`, borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                          ) : (
                            <LayoutDashboard size={11} />
                          )}
                          View
                        </button>
                      )}

                      {/* Delete */}
                      {confirmDeleteId === session.id ? (
                        <div style={{ display: "flex", gap: "0.375rem" }}>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ padding: "0.4rem 0.5rem", borderRadius: "0.375rem", border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, fontSize: "0.75rem", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(session.id)}
                            disabled={deletingId === session.id}
                            style={{ padding: "0.4rem 0.625rem", borderRadius: "0.375rem", border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}
                          >
                            {deletingId === session.id ? "…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(session.id)}
                          style={{ padding: "0.4rem 0.5rem", borderRadius: "0.375rem", border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: "pointer" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

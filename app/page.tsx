"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart2,
  BarChart3,
  Brain,
  CheckCircle2,
  Database,
  FileDown,
  Filter,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Search,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

// ─── Palette ──────────────────────────────────────────────────────────────────
const PAGE    = "#09090b";
const CARD    = "#18181b";
const BORDER  = "#27272a";
const TEXT    = "#fafafa";
const MUTED   = "#71717a";
const ACCENT  = "#7c3aed";
const ACCENTL = "#8b5cf6";
const BLUE    = "#3b82f6";
const GREEN   = "#22c55e";

// ─── Animation variants ───────────────────────────────────────────────────────
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut", delay: i * 0.08 },
  }),
};

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, active: boolean, ms = 1100) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setN(Math.round(p * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return n;
}

// ─── MOCKUP CHARTS ────────────────────────────────────────────────────────────

function MockBarChart() {
  const heights = [62, 38, 80, 52, 70];
  const colors  = [ACCENTL, "#6d28d9", "#a78bfa", "#5b21b6", BLUE];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
      <p style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>Sales by Category</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flex: 1, paddingTop: 2 }}>
        {heights.map((h, i) => (
          <motion.div
            key={i}
            style={{ flex: 1, background: colors[i], borderRadius: "2px 2px 0 0" }}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.7, delay: 0.4 + i * 0.07, ease: "easeOut" }}
          />
        ))}
      </div>
    </div>
  );
}

function MockLineChart() {
  const ref = useRef<SVGPolylineElement>(null);
  const [len, setLen] = useState(180);
  const [go, setGo]   = useState(false);
  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
    const t = setTimeout(() => setGo(true), 500);
    return () => clearTimeout(t);
  }, []);
  const pts = "6,38 22,26 38,32 54,16 70,24 86,12 102,20 118,8";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
      <p style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>Revenue Over Time</p>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <svg width="100%" height="46" viewBox="0 0 124 46">
          {[12, 24, 36].map((y) => (
            <line key={y} x1="0" y1={y} x2="124" y2={y} stroke={BORDER} strokeWidth="0.5" />
          ))}
          <motion.polygon
            points={`${pts} 118,46 6,46`}
            fill={`${ACCENTL}14`}
            initial={{ opacity: 0 }}
            animate={{ opacity: go ? 1 : 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          />
          <polyline
            ref={ref}
            points={pts}
            fill="none"
            stroke={ACCENTL}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: len,
              strokeDashoffset: go ? 0 : len,
              transition: "stroke-dashoffset 0.9s ease-out 0.3s",
            }}
          />
          <motion.circle
            cx="118" cy="8" r="2.5"
            fill={ACCENTL}
            initial={{ scale: 0 }}
            animate={{ scale: go ? 1 : 0 }}
            transition={{ delay: 1.1, duration: 0.25 }}
          />
        </svg>
      </div>
    </div>
  );
}

function MockDonutChart() {
  const r    = 19;
  const circ = 2 * Math.PI * r;
  const segs = [
    { pct: 0.52, color: ACCENTL, label: "Delivered" },
    { pct: 0.30, color: BLUE,    label: "In Transit" },
    { pct: 0.18, color: GREEN,   label: "Pending" },
  ];
  let cumulative = 0;
  const built = segs.map((s) => {
    const dash = s.pct * circ;
    const rot  = (cumulative / circ) * 360 - 90;
    cumulative += dash;
    return { ...s, dash, gap: circ - dash, rot };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
      <p style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>Order Status</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
          {built.map((s, i) => (
            <motion.circle
              key={i}
              cx="22" cy="22" r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`0 ${circ}`}
              transform={`rotate(${s.rot} 22 22)`}
              animate={{ strokeDasharray: `${s.dash} ${s.gap}` }}
              transition={{ duration: 0.75, delay: 0.5 + i * 0.18, ease: "easeOut" }}
            />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {built.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 8, color: MUTED }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockStatCards() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView  = useInView(wrapRef, { once: true });
  const del     = useCountUp(84, inView);
  const churn   = useCountUp(12, inView);
  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 5, height: "100%", justifyContent: "center" }}>
      <p style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>Key Metrics</p>
      <div style={{ background: "#14532d22", border: "1px solid #16653470", borderRadius: 5, padding: "5px 8px" }}>
        <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 700 }}>↑ {del}%</span>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 4 }}>Delivered</span>
      </div>
      <div style={{ background: "#7f1d1d22", border: "1px solid #99131370", borderRadius: 5, padding: "5px 8px" }}>
        <span style={{ fontSize: 10, color: "#f87171", fontWeight: 700 }}>↓ {churn}%</span>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 4 }}>Churned</span>
      </div>
    </div>
  );
}

// ─── Dashboard mockup ─────────────────────────────────────────────────────────
function DashboardMockup() {
  const pills: { label: string; color: string; top?: string; bottom?: string; left?: string; right?: string; delay: number }[] = [
    { label: "✦ AI Cleaned",  color: GREEN,   top: "-16px",  left: "18%",    delay: 0   },
    { label: "✦ Auto Chart",  color: BLUE,    top: "34%",    right: "-22px", delay: 0.6 },
    { label: "✦ Interactive", color: ACCENTL, bottom: "8%",  left: "-20px",  delay: 1.1 },
  ];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Glow */}
      <div style={{
        position: "absolute",
        inset: "-50px",
        background: `radial-gradient(ellipse at 50% 50%, ${ACCENT}28 0%, ${BLUE}12 45%, transparent 70%)`,
        filter: "blur(32px)",
        borderRadius: "50%",
        zIndex: 0,
        pointerEvents: "none",
      }} />

      {/* Floating pills */}
      {pills.map(({ label, color, delay, ...pos }) => (
        <motion.div
          key={label}
          style={{
            position: "absolute",
            ...(pos as Record<string, string>),
            background: `${color}18`,
            border: `1px solid ${color}55`,
            borderRadius: 99,
            padding: "4px 10px",
            fontSize: 10,
            color,
            fontWeight: 700,
            whiteSpace: "nowrap",
            zIndex: 10,
            backdropFilter: "blur(8px)",
          }}
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 3 + delay, repeat: Infinity, ease: "easeInOut", delay }}
        >
          {label}
        </motion.div>
      ))}

      {/* Window chrome */}
      <motion.div
        style={{
          position: "relative",
          zIndex: 1,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          overflow: "hidden",
          width: 360,
          maxWidth: "100%",
          boxShadow: "0 28px 72px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Title bar */}
        <div style={{ background: PAGE, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${BORDER}` }}>
          {["#ef4444", "#f59e0b", GREEN].map((c) => (
            <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
          ))}
          <span style={{ fontSize: 10, color: MUTED, marginLeft: 6, flex: 1 }}>DataViz AI — Dashboard</span>
          <div style={{ width: 40, height: 6, background: BORDER, borderRadius: 3 }} />
        </div>

        {/* Body */}
        <div style={{ display: "flex" }}>
          {/* Filters sidebar */}
          <div style={{ width: 52, background: PAGE, borderRight: `1px solid ${BORDER}`, padding: "10px 7px", display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 7, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Filters</span>
            {[68, 42, 80, 55].map((w, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 2, background: BORDER, borderRadius: 1 }} />
                <div style={{ height: 2, background: ACCENTL, borderRadius: 1, width: `${w}%` }} />
              </div>
            ))}
          </div>

          {/* 2×2 chart grid */}
          <div style={{ flex: 1, padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {[MockBarChart, MockLineChart, MockDonutChart, MockStatCards].map((Comp, i) => (
              <div
                key={i}
                style={{
                  background: PAGE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "8px 9px",
                  height: 96,
                  overflow: "hidden",
                }}
              >
                <Comp />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Pipeline steps ───────────────────────────────────────────────────────────
const PIPELINE = [
  { Icon: Upload,        label: "Upload",    desc: "CSV, Excel or JSON" },
  { Icon: Search,        label: "Profile",   desc: "Column types & distributions" },
  { Icon: Database,      label: "Sample",    desc: "Smart context packaging" },
  { Icon: Sparkles,      label: "Clean",     desc: "Impute, cap outliers, deduplicate" },
  { Icon: Brain,         label: "Understand",desc: "LLM column role classification" },
  { Icon: Wand2,         label: "Engineer",  desc: "Derived feature generation" },
  { Icon: BarChart3,     label: "Analyze",   desc: "EDA, distributions, correlations" },
  { Icon: LayoutDashboard, label: "Dashboard", desc: "Blueprint & chart rendering" },
];

// ─── Feature cards ────────────────────────────────────────────────────────────
const FEATURES = [
  { Icon: Brain,         title: "AI-Powered Cleaning",    desc: "Handles nulls, outliers, and duplicates automatically before analysis." },
  { Icon: LineChart,     title: "Smart Chart Selection",  desc: "AI picks the best chart type for your data and stated goal." },
  { Icon: Filter,        title: "Interactive Filters",    desc: "Click any chart element to cross-filter the entire dashboard instantly." },
  { Icon: Zap,           title: "Feature Engineering",    desc: "Automatically creates derived columns that surface deeper insights." },
  { Icon: FileDown,      title: "Export Ready",           desc: "Download your cleaned dataset as CSV anytime from the dashboard." },
  { Icon: MessageSquare, title: "Prompt Driven",          desc: "Just describe what you want in plain English — no SQL, no code." },
];

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: PAGE, color: TEXT, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ════════════════════ NAVBAR ════════════════════════════════════════ */}
      <Navbar />

      {/* ════════════════════ HERO ══════════════════════════════════════════ */}
      <section style={{ position: "relative", overflow: "hidden", paddingBottom: 96 }}>

        {/* Grid background */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: "48px 48px",
        }} />

        {/* Gradient orbs */}
        {[
          { top: "5%",  left: "-8%",  size: 520, color: `${ACCENT}20`,  dur: 9,  del: 0 },
          { top: "28%", right: "-4%", size: 420, color: `${BLUE}18`,    dur: 11, del: 2 },
          { bottom: "4%", left: "38%", size: 320, color: `${ACCENT}12`, dur: 7,  del: 4 },
        ].map((o, i) => (
          <motion.div
            key={i}
            style={{
              position: "absolute", zIndex: 0, borderRadius: "50%",
              width: o.size, height: o.size,
              background: `radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
              filter: "blur(48px)",
              top: o.top, left: (o as {left?: string}).left, right: (o as {right?: string}).right, bottom: (o as {bottom?: string}).bottom,
            }}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut", delay: o.del }}
          />
        ))}

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "88px 24px 0", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 56 }}>

            {/* ── Text col ── */}
            <motion.div
              style={{ flex: "1 1 360px" }}
              initial="hidden"
              animate={mounted ? "visible" : "hidden"}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: `${ACCENTL}18`, border: `1px solid ${ACCENTL}40`,
                  borderRadius: 99, padding: "4px 14px",
                  fontSize: 11, color: ACCENTL, fontWeight: 700,
                  marginBottom: 24, letterSpacing: 0.4,
                }}>
                  <Sparkles style={{ width: 11, height: 11 }} />
                  Powered by LLaMA 3.3 &amp; Groq
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                style={{
                  fontSize: "clamp(38px, 5.5vw, 60px)",
                  fontWeight: 900,
                  lineHeight: 1.08,
                  letterSpacing: -1.5,
                  margin: "0 0 22px",
                }}
              >
                Turn Any Dataset
                <br />
                Into a{" "}
                <span style={{
                  background: `linear-gradient(130deg, ${ACCENTL} 0%, ${BLUE} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Smart Dashboard
                </span>
                <br />
                In Seconds.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                style={{ fontSize: 16, color: MUTED, lineHeight: 1.72, margin: "0 0 34px", maxWidth: 460 }}
              >
                Upload your data, describe what you want to understand, and let AI
                handle the rest — cleaning, analysis, and visualization.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 }}
              >
                <Link
                  href="/upload"
                  style={{
                    background: `linear-gradient(135deg, ${ACCENT}, ${BLUE})`,
                    color: "#fff", borderRadius: 10, padding: "12px 26px",
                    fontSize: 14, fontWeight: 700, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", gap: 7,
                    boxShadow: `0 8px 24px ${ACCENT}45`,
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  className="hover:scale-[1.03]"
                >
                  Upload Your Data
                  <ArrowRight style={{ width: 16, height: 16 }} />
                </Link>
                <button
                  onClick={scrollToHowItWorks}
                  style={{
                    background: "transparent",
                    border: `1px solid ${BORDER}`,
                    color: TEXT, borderRadius: 10,
                    padding: "12px 24px", fontSize: 14,
                    fontWeight: 600, cursor: "pointer",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  className="hover:border-violet-500/50 hover:bg-white/5"
                >
                  See How It Works
                </button>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={4}
                style={{ display: "flex", flexWrap: "wrap", gap: 20 }}
              >
                {["No coding required", "Free to use", "Powered by AI"].map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: MUTED }}>
                    <CheckCircle2 style={{ width: 14, height: 14, color: GREEN }} />
                    {t}
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* ── Mockup col ── */}
            <motion.div
              style={{ flex: "1 1 360px", display: "flex", justifyContent: "center" }}
              initial={{ opacity: 0, x: 48 }}
              animate={mounted ? { opacity: 1, x: 0 } : { opacity: 0, x: 48 }}
              transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
            >
              <DashboardMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════════ PIPELINE ══════════════════════════════════════ */}
      <section style={{ padding: "88px 24px", background: "#0d0d10" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={stagger}
            style={{ textAlign: "center", marginBottom: 56 }}
          >
            <motion.p variants={fadeUp} style={{ fontSize: 11, color: ACCENTL, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 12 }}>
              Under the Hood
            </motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: -0.5 }}>
              Your Data Pipeline, Automated
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={stagger}
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}
          >
            {PIPELINE.map(({ Icon, label, desc }, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center" }}>
                <motion.div
                  variants={fadeUp}
                  custom={i}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 12, padding: "14px 11px", minWidth: 68,
                    cursor: "default", position: "relative",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  className="hover:border-violet-500/50 hover:bg-zinc-800/60 group"
                  title={desc}
                >
                  <Icon style={{ width: 19, height: 19, color: ACCENTL }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: MUTED, textAlign: "center", whiteSpace: "nowrap", letterSpacing: 0.2 }}>
                    {label}
                  </span>
                  {/* Tooltip */}
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: "#27272a", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "5px 10px",
                    fontSize: 10, color: MUTED, whiteSpace: "nowrap",
                    pointerEvents: "none", opacity: 0,
                    transition: "opacity 0.15s", zIndex: 20,
                  }} className="group-hover:opacity-100">
                    {desc}
                  </div>
                </motion.div>

                {/* Arrow connector */}
                {i < PIPELINE.length - 1 && (
                  <div className="hidden md:flex items-center" style={{ flexShrink: 0 }}>
                    <svg width="26" height="14" viewBox="0 0 26 14">
                      <motion.line
                        x1="0" y1="7" x2="18" y2="7"
                        stroke={`${ACCENTL}60`}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        animate={{ strokeDashoffset: [0, -12] }}
                        transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }}
                      />
                      <polyline
                        points="16,3.5 22,7 16,10.5"
                        fill="none"
                        stroke={`${ACCENTL}60`}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════ FEATURES ══════════════════════════════════════ */}
      <section style={{ padding: "88px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={stagger}
            style={{ textAlign: "center", marginBottom: 56 }}
          >
            <motion.p variants={fadeUp} style={{ fontSize: 11, color: ACCENTL, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 12 }}>
              Features
            </motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: -0.5 }}>
              Everything You Need.{" "}
              <span style={{ color: MUTED }}>Nothing You Don&apos;t.</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={stagger}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}
          >
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <motion.div
                key={title}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -5 }}
                style={{
                  background: CARD, border: `1px solid ${BORDER}`,
                  borderRadius: 14, padding: "24px",
                  cursor: "default", position: "relative", overflow: "hidden",
                  transition: "border-color 0.25s, box-shadow 0.25s",
                }}
                className="hover:border-violet-500/40 hover:shadow-[0_12px_36px_rgba(124,58,237,0.14)] group"
              >
                {/* Shimmer overlay */}
                <motion.div
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg, transparent 30%, rgba(139,92,246,0.07) 50%, transparent 70%)",
                    opacity: 0,
                  }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                />
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${ACCENTL}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16, position: "relative",
                }}>
                  <Icon style={{ width: 20, height: 20, color: ACCENTL }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, position: "relative" }}>{title}</h3>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, position: "relative" }}>{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════ HOW IT WORKS ══════════════════════════════════ */}
      <section id="how-it-works" style={{ padding: "88px 24px", background: "#0d0d10" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={stagger}
            style={{ textAlign: "center", marginBottom: 64 }}
          >
            <motion.p variants={fadeUp} style={{ fontSize: 11, color: ACCENTL, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 12 }}>
              How It Works
            </motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: -0.5 }}>
              From File to Dashboard in 3 Steps
            </motion.h2>
          </motion.div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "center" }}>
            {[
              {
                n: "01",
                title: "Upload & Describe",
                desc: "Upload a CSV, Excel, or JSON file and describe what you want to understand in plain English.",
              },
              {
                n: "02",
                title: "AI Does the Work",
                desc: "Pipeline profiles, cleans, engineers features, and runs full analysis — automatically.",
              },
              {
                n: "03",
                title: "Explore Your Dashboard",
                desc: "Interact with charts, apply filters, drill down into insights, and export results.",
              },
            ].map((step, i, arr) => (
              <div key={step.n} style={{ display: "flex", alignItems: "flex-start", flex: "1 1 220px", minWidth: 220 }}>
                <motion.div
                  initial={{ opacity: 0, y: 32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: i * 0.15, ease: "easeOut" }}
                  style={{ flex: 1, padding: "0 24px" }}
                >
                  {/* Big background number */}
                  <div style={{ position: "relative", marginBottom: 18 }}>
                    <span style={{
                      position: "absolute", top: -10, left: -6,
                      fontSize: 72, fontWeight: 900,
                      color: "rgba(255,255,255,0.04)",
                      lineHeight: 1, userSelect: "none", letterSpacing: -4,
                    }}>
                      {step.n}
                    </span>
                    <span style={{
                      display: "inline-block",
                      background: `${ACCENTL}1c`,
                      border: `1px solid ${ACCENTL}40`,
                      borderRadius: 5, padding: "2px 9px",
                      fontSize: 11, fontWeight: 700, color: ACCENTL,
                      marginBottom: 12, position: "relative",
                    }}>
                      Step {step.n}
                    </span>
                    <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, position: "relative" }}>
                      {step.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
                </motion.div>

                {/* Arrow between steps */}
                {i < arr.length - 1 && (
                  <div className="hidden md:block" style={{ paddingTop: 28, flexShrink: 0 }}>
                    <svg width="40" height="20" viewBox="0 0 40 20">
                      <motion.line
                        x1="0" y1="10" x2="28" y2="10"
                        stroke={BORDER}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        animate={{ strokeDashoffset: [0, -16] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                      />
                      <polyline
                        points="26,5 34,10 26,15"
                        fill="none"
                        stroke={BORDER}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ FILE FORMATS STRIP ════════════════════════════ */}
      <div style={{ background: "#0a0a0d", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "22px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginRight: 4 }}>
            Supported Formats
          </span>
          {["CSV", "Excel (.xlsx / .xls)", "JSON"].map((f) => (
            <span
              key={f}
              style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 99, padding: "6px 18px",
                fontSize: 12, fontWeight: 600, color: MUTED,
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* ════════════════════ FINAL CTA ═════════════════════════════════════ */}
      <section style={{ padding: "104px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          background: `radial-gradient(ellipse at 50% 60%, ${ACCENT}14 0%, transparent 68%)`,
        }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.93 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ maxWidth: 660, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}
        >
          <h2 style={{ fontSize: "clamp(28px, 5vw, 50px)", fontWeight: 900, letterSpacing: -1, marginBottom: 16 }}>
            Ready to See Your Data Differently?
          </h2>
          <p style={{ fontSize: 16, color: MUTED, marginBottom: 40, lineHeight: 1.65 }}>
            No setup. No code. Just upload and go.
          </p>
          <Link
            href="/upload"
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              background: `linear-gradient(135deg, ${ACCENT}, ${BLUE})`,
              color: "#fff", borderRadius: 12, padding: "14px 34px",
              fontSize: 16, fontWeight: 800, textDecoration: "none",
              boxShadow: `0 14px 36px ${ACCENT}45`,
              transition: "transform 0.2s, box-shadow 0.2s",
              letterSpacing: -0.2,
            }}
            className="hover:scale-[1.04] hover:shadow-2xl"
          >
            Build My Dashboard
            <ArrowRight style={{ width: 18, height: 18 }} />
          </Link>
        </motion.div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════════════════════════ */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: "20px 24px" }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 style={{ width: 15, height: 15, color: ACCENTL }} />
            <span style={{ fontWeight: 800, fontSize: 13 }}>DataViz AI</span>
            <span style={{ color: BORDER, fontSize: 13, margin: "0 4px" }}>·</span>
            <span style={{ color: MUTED, fontSize: 12 }}>Upload Data. Ask a Question. Get a Dashboard.</span>
          </div>
          <span style={{ fontSize: 12, color: MUTED }}>Built with Groq + Next.js</span>
        </div>
      </footer>
    </div>
  );
}

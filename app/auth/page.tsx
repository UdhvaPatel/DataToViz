"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, User, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PAGE = "#09090b";
const CARD = "#18181b";
const BORDER = "#27272a";
const TEXT = "#fafafa";
const MUTED = "#71717a";
const ACCENT = "#7c3aed";
const ACCENTL = "#8b5cf6";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/upload";
  const urlError = searchParams.get("error");

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError ?? null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
  }, [tab]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (tab === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); return; }
        router.push(next);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) { setError(error.message); return; }
        setSuccessMsg("Check your email to confirm your account, then sign in.");
        setTab("signin");
      }
    } finally {
      setLoading(false);
    }
  }


  return (
    <div
      style={{ background: PAGE, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ marginBottom: "2rem", textAlign: "center" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Sparkles size={22} style={{ color: ACCENTL }} />
          <span style={{ color: TEXT, fontWeight: 700, fontSize: "1.25rem", letterSpacing: "-0.025em" }}>DataToViz</span>
        </div>
        <p style={{ color: MUTED, fontSize: "0.875rem" }}>
          {tab === "signin" ? "Sign in to your account" : "Create a free account"}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: "0.75rem",
          padding: "2rem",
          width: "100%",
          maxWidth: "400px",
        }}
      >
        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.25rem", background: PAGE, borderRadius: "0.5rem", padding: "0.25rem", marginBottom: "1.75rem" }}>
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "none",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                transition: "all 0.15s",
                background: tab === t ? ACCENTL : "transparent",
                color: tab === t ? TEXT : MUTED,
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>






        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tab === "signup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <Label htmlFor="display-name">Name</Label>
              <div style={{ position: "relative" }}>
                <User size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
                <Input
                  id="display-name"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ paddingLeft: "2.25rem" }}
                />
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <Label htmlFor="email">Email</Label>
            <div style={{ position: "relative" }}>
              <Mail size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: "2.25rem" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <Label htmlFor="password">Password</Label>
            <div style={{ position: "relative" }}>
              <Lock size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
              <Input
                id="password"
                type="password"
                placeholder={tab === "signup" ? "Min. 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={tab === "signup" ? 8 : undefined}
                style={{ paddingLeft: "2.25rem" }}
              />
            </div>
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "0.1rem" }} />
              <p style={{ color: "#ef4444", fontSize: "0.8125rem" }}>{error}</p>
            </div>
          )}

          {successMsg && (
            <div style={{ padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <p style={{ color: "#22c55e", fontSize: "0.8125rem" }}>{successMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: loading ? MUTED : `linear-gradient(135deg, ${ACCENT}, ${ACCENTL})`,
              color: TEXT,
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Loading…" : tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

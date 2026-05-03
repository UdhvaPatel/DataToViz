"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, History, Upload, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import type { User } from "@supabase/supabase-js";

const PAGE    = "#09090b";
const CARD    = "#18181b";
const BORDER  = "#27272a";
const TEXT    = "#fafafa";
const MUTED   = "#71717a";
const ACCENTL = "#8b5cf6";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const setStoreUser = usePipelineStore((s) => s.setUser);
  const setUserProfile = usePipelineStore((s) => s.setUserProfile);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setStoreUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setStoreUser(u);
    });

    return () => subscription.unsubscribe();
  }, [setStoreUser, setUserProfile]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setStoreUser(null);
    setUserProfile(null);
    router.push("/");
  }

  const initials = user?.user_metadata?.display_name
    ? String(user.user_metadata.display_name).slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "";

  const navLinks = [
    { href: "/upload", label: "New Analysis", icon: Upload },
    { href: "/history", label: "History", icon: History },
  ];

  return (
    <nav
      style={{
        background: PAGE,
        borderBottom: `1px solid ${BORDER}`,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 1.5rem",
          height: "3.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles size={18} style={{ color: ACCENTL }} />
          <span style={{ color: TEXT, fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.025em" }}>
            DataToViz
          </span>
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {user ? (
            <>
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.375rem 0.75rem",
                    borderRadius: "0.375rem",
                    textDecoration: "none",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: pathname === href ? TEXT : MUTED,
                    background: pathname === href ? "rgba(139,92,246,0.12)" : "transparent",
                    transition: "color 0.15s, background 0.15s",
                  }}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              ))}

              {/* Avatar dropdown */}
              <div ref={dropdownRef} style={{ position: "relative", marginLeft: "0.5rem" }}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.5rem",
                    border: `1px solid ${BORDER}`,
                    background: "transparent",
                    cursor: "pointer",
                    color: TEXT,
                  }}
                >
                  <div
                    style={{
                      width: "1.75rem",
                      height: "1.75rem",
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, #7c3aed, ${ACCENTL})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: TEXT,
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>
                  <ChevronDown size={12} style={{ color: MUTED }} />
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 0.375rem)",
                      background: CARD,
                      border: `1px solid ${BORDER}`,
                      borderRadius: "0.5rem",
                      minWidth: "180px",
                      padding: "0.375rem",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div style={{ padding: "0.5rem 0.625rem 0.625rem", borderBottom: `1px solid ${BORDER}`, marginBottom: "0.375rem" }}>
                      <p style={{ color: TEXT, fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.125rem" }}>
                        {displayName}
                      </p>
                      <p style={{ color: MUTED, fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {user.email}
                      </p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.625rem",
                        borderRadius: "0.375rem",
                        border: "none",
                        background: "transparent",
                        color: MUTED,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = MUTED;
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
                    >
                      <LogOut size={13} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link
              href={`/auth?next=${encodeURIComponent(pathname)}`}
              style={{
                padding: "0.375rem 1rem",
                borderRadius: "0.5rem",
                background: `linear-gradient(135deg, #7c3aed, ${ACCENTL})`,
                color: TEXT,
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/cloud";
export default function AccountMenu({ email, blocked, onSettings, onError }: {
  email?: string; blocked: boolean; onSettings: () => void; onError: (message: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const close = (event: Event) => {
      if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !menu.current?.contains(event.target as Node)) {
        if (event.type === "keydown" && menu.current?.open) menu.current.querySelector("summary")?.focus();
        menu.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details ref={menu} className="ss-reference-tools ss-account-menu">
    <summary className="ss-reference-avatar" aria-label="My account" title={email}>{(email || "You").slice(0,2).toUpperCase()}</summary>
    <div>
      <span>{email || "Your account"}</span>
      <button onClick={() => { menu.current?.removeAttribute("open"); onSettings(); }}>Account settings</button>
      <button disabled={busy || blocked} onClick={async () => {
        setBusy(true);
        try {
          const client = authClient();
          if (!client) throw new Error("Sign-out is unavailable in this isolated review.");
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw error;
        } catch (e) { onError(e instanceof Error ? e.message : "Could not sign out. Please retry."); }
        finally { setBusy(false); }
      }}>{busy ? "Signing out…" : "Sign out"}</button>
      {blocked && <small>End the active session and confirm any capture draft before signing out.</small>}
    </div>
  </details>;
}

"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { authClient, cloudConfigured, clearSyncCache } from "@/lib/cloud";
import Dashboard from "./dashboard";
export default function AuthGate() {
  const openSignup = process.env.NEXT_PUBLIC_OPEN_SIGNUP === "true";
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState<"signin" | "signup" | "reset" | "new-password">(
      "signin",
    );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const client = authClient();
    if (!client) {
      setReady(true);
      return;
    }
    let active = true;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setUser(error ? null : data.session?.user || null);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setReady(true);
          setError("Could not check your account. Please sign in again.");
        }
      });
    const listener = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") clearSyncCache();
      setUser(session?.user || null);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setMode("new-password");
    });
    return () => {
      active = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <div className="loading">
        <Activity size={28} />
        <span>Checking your account…</span>
      </div>
    );
  if (user && mode !== "new-password")
    return (
      <Dashboard key={user.id} user={{ id: user.id, email: user.email }} />
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = authClient();
      if (!client)
        throw new Error(
          "Accounts are being prepared. Please check back shortly.",
        );
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for that email, you will receive a password reset link.",
        );
      }
      if (mode === "new-password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMode("signin");
        setMessage("Password updated.");
      }
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "signup"
      ? "Your workspace starts here."
      : mode === "reset"
        ? "Let’s get you back in."
        : mode === "new-password"
          ? "Choose a new password."
          : "Welcome to Trade Pulse.";
  return (
    <main className="auth-page">
      <a className="brand auth-brand" href="/">
        <span className="brand-icon">
          <Activity size={23} />
        </span>
        <span>
          trade<span className="brand-light">pulse</span>
          <span className="brand-dot">.</span>
        </span>
      </a>
      <section className="auth-layout">
        <div className="auth-story">
          <div className="eyebrow">YOUR EDGE STARTS WITH AWARENESS</div>
          <h1>
            Know your pulse.
            <br />
            Understand your trades.
          </h1>
          <p>
            One timeline for your heart rate, your trading activity, and your
            own reflections.
          </p>
          <div className="pulse-sculpture" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="auth-features">
            <span>
              <ShieldCheck size={17} />A private workspace for each account
            </span>
            <span>
              <Activity size={17} />
              Only the data you record or import
            </span>
            <span>
              <LockKeyhole size={17} />
              Your sessions belong to you
            </span>
          </div>
          <p className="auth-footnote">
            Start with an empty journal. Add trades, import CSV, or connect
            TradingView. A wearable is optional.
          </p>
        </div>
        <div className="glass auth-card">
          <h2>{title}</h2>
          <p>
            {mode === "signup"
              ? "Create your own account to keep your recordings private."
              : mode === "reset"
                ? "Enter your account email."
                : mode === "new-password"
                  ? "Use a password unique to this account."
                  : "Sign in to open your personal workspace."}
          </p>
          {!cloudConfigured && (
            <div className="banner" role="status">
              Accounts are being prepared. Please check back shortly.
            </div>
          )}
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="banner" role="status">
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            {mode !== "new-password" && (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "signin" ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "signin"
                      ? "Your password"
                      : "At least 8 characters"
                  }
                />
              </label>
            )}
            <button
              className="button primary full"
              disabled={busy || !cloudConfigured}
            >
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : mode === "new-password"
                      ? "Update password"
                      : "Sign in"}
              <ArrowUpRight size={15} />
            </button>
          </form>
          {!openSignup && (
            <p className="auth-footnote">
              Private beta. Use the account provided to you.
            </p>
          )}
          <div className="auth-links">
            {mode === "signin" && openSignup ? (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setMessage("");
                  }}
                >
                  Create an account
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setMode("reset");
                    setError("");
                    setMessage("");
                  }}
                >
                  Forgot password?
                </button>
              </>
            ) : mode !== "signin" ? (
              <button
                className="text-button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setMessage("");
                }}
              >
                Back to sign in
              </button>
            ) : null}
          </div>
          <a className="auth-privacy" href="/privacy">
            Privacy & data details
          </a>
        </div>
      </section>
    </main>
  );
}

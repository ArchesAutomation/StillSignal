"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/cloud";
import {
  pairingRequestSchema,
  extensionMessage,
  connectedExtension,
  updateExtensionLease,
} from "@/lib/extension-bridge";
import type { WorkspaceUser } from "@/lib/workspace";
import type { JournalEntry } from "@/lib/model";
type Connection = {
  id: string;
  instance_id: string;
  expires_at: string;
  revoked_at?: string;
};
async function api<T>(payload: unknown): Promise<T> {
  const token = (await authClient()?.auth.getSession())?.data.session
    ?.access_token;
  if (!token) throw new Error("Sign in before pairing the extension.");
  const r = await fetch("/api/extension", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Connection failed.");
  return d;
}
export default function ExtensionConnection({
  user,
  sessionId,
  manage = false,
  scope,
}: {
  user: WorkspaceUser;
  sessionId?: string;
  manage?: boolean;
  scope?: JournalEntry["captureScope"];
}) {
  const [pair, setPair] = useState<ReturnType<
      typeof pairingRequestSchema.parse
    > | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [connections, setConnections] = useState<Connection[]>([]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("connectExtension")) {
      const p = pairingRequestSchema.safeParse({
        extensionId: params.get("connectExtension"),
        instanceId: params.get("instance"),
        challenge: params.get("challenge"),
      });
      if (p.success) setPair(p.data);
      else
        setMessage(
          "Invalid extension pairing request. Start Connect Still Signal again.",
        );
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const heartbeat = async () => {
      const id = connectedExtension(user.id);
      if (!id) return;
      try {
        const r = await extensionMessage(id, {
          type: "context",
          userId: user.id,
          sessionId,
          scope,
        });
        if (alive) updateExtensionLease(user.id, r);
      } catch {
        if (alive) updateExtensionLease(user.id, { connected: false });
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 5000);
    const subscription = authClient()?.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          (session?.user && session.user.id !== user.id)
        ) {
          const id = connectedExtension(user.id);
          if (id)
            void extensionMessage(id, {
              type: "account-left",
              userId: user.id,
            }).catch(() => {});
          updateExtensionLease(user.id, { connected: false });
        }
      },
    );
    return () => {
      alive = false;
      clearInterval(timer);
      subscription?.data.subscription.unsubscribe();
    };
  }, [
    user.id,
    sessionId,
    scope?.instrumentId,
    scope?.accountId,
    scope?.baselineSeconds,
    scope?.windowSeconds,
  ]);
  useEffect(() => {
    if (manage)
      void api<{ connections: Connection[] }>({ action: "connections" })
        .then((d) => setConnections(d.connections))
        .catch((e) => setMessage(e.message));
  }, [manage, user.id]);
  async function approve() {
    if (!pair) return;
    setBusy(true);
    setMessage("");
    try {
      const d = await api<{ code: string }>({ action: "pair", ...pair });
      const result = await extensionMessage(pair.extensionId, {
        type: "pair-result",
        code: d.code,
        instanceId: pair.instanceId,
        challenge: pair.challenge,
      });
      if (result.userId !== user.id)
        throw new Error("Extension identity mismatch.");
      localStorage.setItem("pulse-extension:" + user.id, pair.extensionId);
      setPair(null);
      const u = new URL(window.location.href);
      for (const p of ["connectExtension", "instance", "challenge"])
        u.searchParams.delete(p);
      window.history.replaceState(null, "", u.toString());
      setMessage("Extension connected. You can journal from any trading tab.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not pair extension.");
    } finally {
      setBusy(false);
    }
  }
  if (!pair && !manage && !message) return null;
  return (
    <section
      className={manage ? "glass settings-card" : "banner"}
      aria-label="Voice journal extension"
    >
      {pair ? (
        <div>
          <h3>Connect voice journaling</h3>
          <p>
            Connect this Chrome extension to{" "}
            <strong>{user.email || user.id}</strong>. It can read your journal
            context and create, correct, tag, and undo reflections. Trading
            credentials and order placement are outside its scope.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void approve()}
          >
            {busy ? "Connecting…" : "Connect this account"}
          </button>
          <button className="button" onClick={() => setPair(null)}>
            Cancel
          </button>
        </div>
      ) : manage ? (
        <div>
          <h3>Voice journal extension</h3>
          <p>
            Pair from the extension’s Connect Still Signal button. Microphone
            permission and recording shortcuts are managed in Chrome.
          </p>
          <p>
            <a href="/trade-pulse-voice-extension.zip" download>
              Download the Chrome extension
            </a>
            . Unzip it, open <strong>chrome://extensions</strong>, enable
            Developer mode, and choose <strong>Load unpacked</strong>. Select
            the unzipped folder, then click its toolbar icon to connect.
          </p>
          {connections
            .filter((c) => !c.revoked_at)
            .map((c) => (
              <div className="inline-actions" key={c.id}>
                <span>
                  Installation {c.instance_id.slice(0, 8)} · expires{" "}
                  {new Date(c.expires_at).toLocaleDateString()}
                </span>
                <button
                  className="button"
                  onClick={() =>
                    void api({ action: "revoke", credentialId: c.id })
                      .then(async () => {
                        const id = connectedExtension(user.id);
                        if (id)
                          await extensionMessage(id, {
                            type: "account-left",
                            userId: user.id,
                          }).catch(() => {});
                        setConnections((x) => x.filter((v) => v.id !== c.id));
                      })
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
        </div>
      ) : null}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

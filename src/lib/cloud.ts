import { createClient } from "@supabase/supabase-js";
import type { Session, Sample, TradeEvent } from "./model";
import { mergeSessions } from "./workspace";
import { pending, acknowledge, listSessions, saveSession } from "./storage";
export const cloudConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
);
let client: ReturnType<typeof createClient> | undefined;
export function authClient() {
  if (!cloudConfigured) return null;
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  ));
}
export async function api<T>(payload: unknown): Promise<T> {
  const s = await authClient()?.auth.getSession();
  const token = s?.data.session?.access_token;
  if (!token) throw new Error("Sign in to use cloud sync.");
  const r = await fetch("/api/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      data.error || "Cloud request failed. Your local data is safe.",
    );
  return data as T;
}
let syncing = false;
const uploaded = new Map<string, string>();
export function clearSyncCache(){uploaded.clear();}
export async function sync(owner: string) {
  if (syncing || !navigator.onLine) return 0;
  syncing = true;
  try {
    const sessions = await listSessions(owner);
    for (const s of sessions) {
      const fingerprint = JSON.stringify(s);
      if (uploaded.get(s.id) !== fingerprint) {
        await api({ action: "save", session: s });
        uploaded.set(s.id, fingerprint);
      }
    }
    const batches = await pending(owner);
    let n = 0;
    for (const b of batches.slice(0, 20)) {
      for (let i = 0; i < b.samples.length; i += 120) {
        const batchId =
          i === 0
            ? b.id
            : b.id.slice(0, 24) +
              (parseInt(b.id.slice(24), 16) + i * 1000000000)
                .toString(16)
                .padStart(12, "0");
        await api({
          action: "batch",
          sessionId: b.sessionId,
          batchId,
          samples: b.samples.slice(i, i + 120),
        });
      }
      await acknowledge(b.id);
      n++;
    }
    return Math.max(0, batches.length - n);
  } finally {
    syncing = false;
  }
}
export async function pullSessions(owner: string) {
  const data = await api<{ sessions: Session[] }>({ action: "list" });
  const local = await listSessions(owner);
  for (const s of data.sessions) {
    if (s.owner !== owner) throw new Error("Workspace identity mismatch.");
    await saveSession(
      mergeSessions(
        local.find((l) => l.id === s.id),
        s,
      ),
    );
  }
  return data.sessions;
}
export async function pullSession(id: string) {
  let cursor: string | undefined;
  const samples: Sample[] = [];
  let session: Session | undefined;
  let events: TradeEvent[] = [];
  do {
    const d = await api<{
      session: Session;
      samples: Sample[];
      events: TradeEvent[];
      next?: string;
    }>({ action: "get", sessionId: id, cursor });
    session = d.session;
    events = d.events;
    samples.push(...d.samples);
    cursor = d.next;
  } while (cursor);
  return {
    session: session!,
    samples: samples.sort((a, b) => a.t - b.t),
    events,
  };
}

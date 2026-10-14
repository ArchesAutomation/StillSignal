"use client";
import type { Session, TradeEvent } from "@/lib/model";
export default function WorkspaceToolbar({
  session,
  sessions,
  events,
  account,
  instrument,
  recording,
  onAccount,
  onInstrument,
  onSession,
}: {
  session: Session;
  sessions: Session[];
  events: TradeEvent[];
  account: string;
  instrument: string;
  recording: boolean;
  onAccount: (id: string) => void;
  onInstrument: (id: string) => void;
  onSession: (session: Session) => void;
}) {
  const accounts = [
    ...new Set(events.map((e) => e.broker?.accountId || e.account || "manual")),
  ];
  const instruments = [
    ...new Map(events.map((e) => [e.instrument?.id || e.symbol, e])).entries(),
  ];
  return (
    <div className="workspace-toolbar">
      <label>
        <span>Session</span>
        <select
          aria-label="Workspace session"
          value={session.id}
          disabled={recording}
          onChange={(e) => {
            const s = sessions.find((s) => s.id === e.target.value);
            if (s) onSession(s);
          }}
        >
          <option value={session.id}>
            {session.id === "workspace" ? "New workspace" : session.name}
          </option>
          {sessions
            .filter((s) => s.id !== session.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>Account</span>
        <select
          aria-label="Workspace account"
          value={account}
          onChange={(e) => onAccount(e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((id) => (
            <option key={id} value={id}>
              {id === "manual" ? "Manual / imported" : id.slice(0, 12)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Instrument</span>
        <select
          aria-label="Workspace instrument"
          value={instrument}
          onChange={(e) => onInstrument(e.target.value)}
        >
          <option value="">All instruments · timeline</option>
          {instruments.map(([id, event]) => (
            <option key={id} value={id}>
              {event.symbol}
              {event.instrument?.exchange
                ? " · " + event.instrument.exchange
                : ""}
            </option>
          ))}
        </select>
      </label>
      <span className="workspace-scope">UTC aligned · local display</span>
    </div>
  );
}

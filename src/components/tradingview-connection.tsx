"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { api } from "@/lib/cloud";
import { tradingViewMessage } from "@/lib/tradingview";
type Connection = {
  expiresAt: string;
  lastReceivedAt: string | null;
  eventCount: number;
  timezone: string;
};
export default function TradingViewConnection({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(""),
    [mode, setMode] = useState<"alert" | "strategy">("alert"),
    [kind, setKind] = useState<"entry" | "exit">("entry"),
    [side, setSide] = useState<"long" | "short">("long"),
    [quantity, setQuantity] = useState(1),
    [timezone, setTimezone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [key] = useState(() => crypto.randomUUID().slice(0, 8));
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api<{ connection: Connection | null }>({ action: "connection-status" })
        .then((d) => {
          if (alive) setConnection(d.connection);
        })
        .catch(() => {});
    void refresh();
    const t = setInterval(refresh, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pulse-tradingview`,
    message = token
      ? tradingViewMessage(token, mode, key, kind, side, quantity)
      : "";
  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("Select the field and copy it manually.");
    }
  }
  return (
    <section className="glass connection-card">
      <div className="connection-top">
        <span className="connection-logo tv">
          T<span>V</span>
        </span>
        <span className="tag">{connection ? "Connected" : "Live alerts"}</span>
      </div>
      <h2>TradingView</h2>
      <p>
        Use your trading journal without a wearable. Alerts join an open journal
        or create daily journals automatically, even when this app is closed.
        Sessions and notes stay private to your account.
      </p>
      <ol>
        <li>Generate your connection below.</li>
        <li>
          In TradingView, create an alert and paste the webhook URL under
          Notifications.
        </li>
        <li>Paste the generated JSON into Message and create the alert.</li>
        <li>Check the delivery status here after an alert fires.</li>
      </ol>
      <div className="form-grid">
        <label>
          Daily journal timezone
          <input
            list="tv-timezones"
            value={timezone}
            disabled={!!connection && !token}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id="tv-timezones">
            {[
              "UTC",
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "Europe/London",
            ].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <small>
            Sets the day boundary for incoming alerts. Saved when generating the
            connection.
          </small>
        </label>
        <label>
          Alert type
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "alert" | "strategy")}
          >
            <option value="alert">Price / indicator alert</option>
            <option value="strategy">Strategy order fills</option>
          </select>
        </label>
      </div>
      {mode === "alert" ? (
        <div className="form-grid">
          <label>
            Event
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "entry" | "exit")}
            >
              <option value="entry">Entry</option>
              <option value="exit">Exit</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "long" | "short")}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              value={quantity}
              min="0.00000001"
              max="1000000000000"
              step="any"
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
        </div>
      ) : (
        <p className="connection-note">
          Choose your strategy’s Order fills alert condition. The message uses
          TradingView’s strategy placeholders to distinguish entries, exits,
          partial closes, and reversals. These are strategy fills, not
          independently verified broker executions.
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !Number.isFinite(quantity) || quantity <= 0}
        onClick={() =>
          void act(async () => {
            const d = await api<{ token: string; connection: Connection }>({
              action: "connection",
              timezone,
            });
            setToken(d.token);
            setConnection(d.connection);
            onChanged();
          })
        }
      >
        <Link2 size={16} />
        {connection
          ? "Rotate key & regenerate setup"
          : "Generate webhook setup"}
      </button>
      {connection && (
        <div className="connection-note" role="status">
          {connection.lastReceivedAt
            ? `${connection.eventCount} events received · Last delivery ${new Date(connection.lastReceivedAt).toLocaleString()}`
            : "Waiting for your first TradingView alert."}
          <br />
          Key expires {new Date(
            connection.expiresAt,
          ).toLocaleDateString()}. {connection.timezone} daily journals.
        </div>
      )}
      {token && (
        <div className="hook-config">
          <label>
            Webhook URL
            <input readOnly value={url} />
          </label>
          <button className="text-button" onClick={() => void copy("URL", url)}>
            {copied === "URL" ? <Check size={13} /> : <Copy size={13} />}Copy
            webhook URL
          </button>
          <label>
            Alert message
            <textarea readOnly rows={12} value={message} />
          </label>
          <button
            className="text-button"
            onClick={() => void copy("message", message)}
          >
            {copied === "message" ? <Check size={13} /> : <Copy size={13} />}
            Copy alert message
          </button>
          <p>
            Make a separate alert for each event/direction. The key only
            receives journal events; it cannot read your account or place
            trades. Keep it private. Rotation invalidates old alert messages.
          </p>
        </div>
      )}
      <p className="connection-note">
        TradingView requires 2FA and webhook access on your plan. Alerts are not
        an automatic feed of every manual or broker trade; import a broker CSV
        for executions that have no alert. Resends with the same event ID are
        deduplicated.
      </p>
      {connection && (
        <button
          className="text-button rose"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await api({ action: "disconnect" });
              setConnection(null);
              setToken("");
              onChanged();
            })
          }
        >
          Disconnect TradingView
        </button>
      )}
      {error && (
        <p role="alert" className="banner error">
          {error}
        </p>
      )}
    </section>
  );
}

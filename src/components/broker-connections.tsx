"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { routeAvailability } from "@/lib/brokers/registry";
import BrokerWizard from "./broker-wizard";
import {
  brokerHelp,
  brokerRequest,
  type BrokerActionResult,
  type BrokerState,
} from "./broker-client";
const empty = (): BrokerState => ({
  routes: routeAvailability({}),
  connections: [],
  accounts: [],
  jobs: [],
});
export default function BrokerConnections({
  owner,
  onChanged,
  onViewJournal,
}: {
  owner: string;
  onChanged: () => void;
  onViewJournal?: () => void;
}) {
  const [state, setState] = useState<BrokerState>(empty);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    currentOwner = useRef(owner);
  currentOwner.current = owner;
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const result = await brokerRequest<BrokerState>({ action: "status" });
      if (generation.current === version) {
        setState(result);
        setError("");
      }
    } catch {
      if (generation.current === version)
        setError(
          "We couldn't check your broker connections. Refresh status to retry.",
        );
    } finally {
      if (generation.current === version) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setState(empty());
    setLoading(true);
    setBusy(false);
    setError("");
    setMessage("");
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const returned = () => void refresh();
    window.addEventListener("focus", returned);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("focus", returned);
    };
  }, [owner, refresh]);
  async function act(
    payload: unknown,
  ): Promise<BrokerActionResult | undefined> {
    const identity = owner;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await brokerRequest<BrokerActionResult>(payload);
      if (currentOwner.current !== identity) return;
      if (result.message) setMessage(result.message);
      await refresh();
      if (currentOwner.current !== identity) return;
      onChanged();
      return result;
    } catch (e) {
      if (currentOwner.current !== identity) return;
      const text =
        e instanceof Error ? e.message : "Connection failed. Please try again.";
      const code = text.match(/Broker request failed: ([A-Z0-9_]+)/)?.[1];
      setError(code ? brokerHelp(code) : text);
    } finally {
      if (currentOwner.current === identity) setBusy(false);
    }
  }
  return (
    <section className="glass broker-section">
      <div className="broker-intro">
        <div>
          <span className="eyebrow">AUTOMATIC JOURNALING</span>
          <h2>Connect your trading account</h2>
          <p>
            Three guided steps. Keep trading in your usual platform; your trades
            and heart rate meet here.
          </p>
        </div>
        <span className="tag">
          <ShieldCheck size={13} /> No order placement
        </span>
      </div>
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
      {loading ? (
        <p className="broker-catalog" role="status">
          Checking available connections…
        </p>
      ) : (
        <BrokerWizard
          key={owner}
          owner={owner}
          state={state}
          busy={busy}
          onAction={act}
          onChanged={onChanged}
          onViewJournal={onViewJournal}
        />
      )}
      <div className="broker-connected">
        <div className="panel-heading">
          <h3>Connected accounts</h3>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            <RefreshCw size={13} /> Refresh status
          </button>
        </div>
        {!state.connections.length && (
          <p>
            No broker is connected yet. You can also{" "}
            <a href="#trade-csv">import a trade CSV</a>.
          </p>
        )}
        {state.connections.map((c) => (
          <div key={c.id}>
            <div className="broker-account">
              <div>
                <strong>
                  {state.routes.find((r) => r.id === c.provider)?.name ||
                    c.provider}{" "}
                  · {c.environment === "paper" ? "Demo / practice" : "Live"}
                </strong>
                <small>
                  {c.status === "connected"
                    ? "Account linked"
                    : c.status === "revoked"
                      ? "Disconnected"
                      : c.status === "pending"
                        ? "Waiting for authorization and account checks"
                        : "Needs attention"}
                  {c.last_sync_at
                    ? " · Last history check " +
                      new Date(c.last_sync_at).toLocaleString()
                    : " · No completed history check"}
                </small>
                {c.error_code && <small>{brokerHelp(c.error_code)}</small>}
              </div>
              <div className="inline-actions">
                <button
                  className="text-button"
                  disabled={busy || c.status === "revoked"}
                  onClick={() =>
                    void act({ action: "refresh", connectionId: c.id })
                  }
                >
                  Refresh accounts
                </button>
                <button
                  className="text-button"
                  disabled={busy || c.status === "revoked"}
                  onClick={() =>
                    void act({ action: "disconnect", connectionId: c.id })
                  }
                >
                  Disconnect
                </button>
              </div>
            </div>
            {state.accounts
              .filter((a) => a.connection_id === c.id)
              .map((a) => {
                const job = state.jobs.find((j) => j.account_id === a.id);
                return (
                  <div className="broker-account" key={a.id}>
                    <div>
                      <strong>
                        {a.name} · {a.currency}
                      </strong>
                      <small>
                        {a.institution} · {a.metadata.maskedNumber} ·{" "}
                        {!a.identity_verified
                          ? "Account identity needs review before import"
                          : job?.error_code
                            ? brokerHelp(job.error_code)
                            : job
                              ? "History import " +
                                (job.state === "leased"
                                  ? "in progress"
                                  : job.state === "paused"
                                    ? "needs attention"
                                    : "scheduled")
                              : "Automatic trade import isn't available for this connection yet"}
                      </small>
                    </div>
                    {job && c.status === "connected" && (
                      <button
                        className="text-button"
                        disabled={busy || !a.identity_verified}
                        onClick={() =>
                          void act({ action: "sync", accountId: a.id })
                        }
                      >
                        Sync history
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </section>
  );
}

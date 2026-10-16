"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/cloud";
import { routeAvailability } from "@/lib/brokers/registry";
import type { BrokerProvider } from "@/lib/brokers/model";
type State = {
  routes: ReturnType<typeof routeAvailability>;
  connections: {
    id: string;
    provider: BrokerProvider;
    status: string;
    environment: string;
    last_sync_at?: string;
    error_code?: string;
  }[];
  accounts: {
    id: string;
    connection_id: string;
    institution: string;
    name: string;
    currency: string;
    environment: string;
    identity_verified: boolean;
    metadata: { maskedNumber?: string; prerequisite?: string };
  }[];
  jobs: {
    account_id: string;
    state: string;
    error_code?: string;
    run_after: string;
  }[];
};
async function request<T>(payload: unknown): Promise<T> {
  const token = (await authClient()?.auth.getSession())?.data.session
    ?.access_token;
  if (!token) throw new Error("Sign in to manage broker connections.");
  const response = await fetch("/api/brokers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Broker service unavailable.");
  return data;
}
export default function BrokerConnections({
  owner,
  onChanged,
}: {
  owner: string;
  onChanged: () => void;
}) {
  const [state, setState] = useState<State>({
    routes: routeAvailability({}),
    connections: [],
    accounts: [],
    jobs: [],
  });
  const [catalog, setCatalog] = useState<{ slug: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [keyProvider, setKeyProvider] = useState<BrokerProvider | null>(null);
  const [portal, setPortal] = useState("");
  const [environment, setEnvironment] = useState<"live" | "paper">("live");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const snaptradeAvailable = !!state.routes.find((r) => r.id === "snaptrade")?.available;
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const result = await request<State>({ action: "status" });
      if (generation.current === version) {
        setState(result);
        setError("");
      }
    } catch (error) {
      if (generation.current === version)
        setError(
          error instanceof Error
            ? error.message
            : "Broker service unavailable.",
        );
    } finally {
      if (generation.current === version) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const returned = () => void refresh();
    window.addEventListener("focus", returned);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", returned);
      generation.current++;
    };
  }, [owner, refresh]);
  useEffect(() => {
    if (!snaptradeAvailable) return;
    let active = true;
    void request<{ institutions: typeof catalog }>({ action: "catalog" })
      .then((r) => {
        if (active) setCatalog(r.institutions);
      })
      .catch(() => {
        if (active)
          setError(
            "Institution catalog could not be loaded. Retry before connecting.",
          );
      });
    return () => {
      active = false;
    };
  }, [snaptradeAvailable]);
  async function act(payload: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request<{
        url?: string;
        queued?: boolean;
        message?: string;
      }>(payload);
      if (result.url) {
        // New tab leaves the recorder mounted and its Bluetooth connection intact.
        setPortal(result.url);
        setMessage(
          "Continue to secure sign-in below. After you approve access, return here—we’ll check your connection automatically. Recording continues in this tab.",
        );
      } else
        setMessage(
          result.message ||
            (result.queued
              ? "Sync queued. The worker will import available history."
              : "Connection updated."),
        );
      await refresh();
      onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass broker-section">
      <div className="broker-intro">
        <div>
          <span className="eyebrow">AUTOMATIC JOURNALING</span>
          <h2>Connect your trading account</h2>
          <p>
            Choose your broker, sign in securely, then return here to check
            your first sync. You can keep placing trades in TradingView.
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
      {portal && (
        <div className="broker-catalog">
          <a
            className="button primary"
            href={portal}
            target="_blank"
            rel="noreferrer"
          >
            Continue to secure sign-in <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      {loading ? (
        <p role="status">Checking available connections…</p>
      ) : (
        <div className="broker-catalog">
          <div className="form-grid">
            <label>
              Your broker
              <select
                value={selectedProvider}
                disabled={busy}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setKeyProvider(null);
                  setPortal("");
                  setMessage("");
                }}
              >
                <option value="">Choose your broker</option>
                {state.routes.filter((r) => r.available).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id === "snaptrade" ? "Find another brokerage" : r.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedProvider && selectedProvider !== "snaptrade" && (
              <label>
                Account type
                <select
                  aria-label="Broker account type"
                  value={environment}
                  disabled={busy}
                  onChange={(e) => {
                    setEnvironment(e.target.value as "live" | "paper");
                    setPortal("");
                    setMessage("");
                  }}
                >
                  <option value="live">Live account</option>
                  <option value="paper">Demo / practice account</option>
                </select>
              </label>
            )}
          </div>
          {!state.routes.some((r) => r.available) && (
            <p>
              Automatic broker connections haven’t been enabled yet. You can
              journal now and import your trades with a CSV.
            </p>
          )}
          <details>
            <summary>Don’t see your broker?</summary>
            <p>
              Only connections enabled for TraderPulse appear above. Other
              brokerages can use CSV import while their connection is being set up.
            </p>
          </details>
        </div>
      )}
      <div className="broker-routes">
        {state.routes.filter((r) => r.available && r.id === selectedProvider).map((route) => (
          <article className="broker-route" key={route.id}>
            <div className="connection-top">
              <h3>{route.name}</h3>
              <span className="tag">
                {route.available ? "Available" : "Requires access"}
              </span>
            </div>
            <p>
              {route.method === "key"
                ? "Connect with a key from your broker’s account settings. We’ll ask only for the details this broker needs."
                : "Sign in on the secure connection page and approve access to your account history."}
            </p>
            <small>
              {route.id === "snaptrade"
                ? "Historical activity sync. Exact intraday trade times depend on your broker."
                : route.id === "tradestation"
                  ? "Account linking is supported. Automatic trade imports still need an execution feed."
                  : "Trade history updates periodically. Check the last successful sync below."}
            </small>
            <div className="inline-actions">
              {route.available && (
                <button
                  className="button small-button"
                  disabled={busy}
                  onClick={() =>
                    route.method === "key"
                      ? setKeyProvider(route.id)
                      : void act({
                          action: "connect",
                          provider: route.id,
                          environment,
                        })
                  }
                >
                  {route.method === "key" ? "Enter connection details" : "Connect account"} <ArrowUpRight size={13} />
                </button>
              )}
              <a href={route.docs} target="_blank" rel="noreferrer">
                Connection help
              </a>
            </div>
          </article>
        ))}
      </div>
      {selectedProvider === "snaptrade" && catalog.length > 0 && (
        <div className="broker-catalog">
          <h3>Find your brokerage</h3>
          <p>
            Choose your brokerage to continue to secure sign-in. Available
            live and practice accounts depend on your broker.
          </p>
          <label>
            Search brokerages
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="catalog-options">
            {catalog.filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase())).map((b) => (
              <button
                key={b.slug}
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "connect",
                    provider: "snaptrade",
                    broker: b.slug,
                  })
                }
              >
                {b.name}
              </button>
            ))}
          </div>
          {!catalog.some((b) => b.name.toLowerCase().includes(search.trim().toLowerCase())) && (
            <p>No matching brokerage. Try another name, or import a CSV.</p>
          )}
        </div>
      )}
      {keyProvider && (
        <form
          className="broker-catalog"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const payload = {
              action: "connect",
              provider: keyProvider,
              environment,
              accessToken: f.get("accessToken") || undefined,
              apiKey: f.get("apiKey") || undefined,
              userName: f.get("userName") || undefined,
            };
            e.currentTarget.reset();
            setKeyProvider(null);
            void act(payload);
          }}
        >
          <h3>{state.routes.find((r) => r.id === keyProvider)?.name}</h3>
          <p>
            Your token goes directly to protected server storage. Native tokens
            may include trading privileges; TraderPulse only reads data.
          </p>
          {keyProvider === "projectx" && (
            <label>
              Platform username
              <input
                name="userName"
                autoComplete="off"
                required
                maxLength={120}
              />
            </label>
          )}
          <label>
            {keyProvider === "oanda" ? "API token" : "API key"}
            <input
              name={keyProvider === "oanda" ? "accessToken" : "apiKey"}
              type="password"
              autoComplete="off"
              required
              maxLength={8192}
            />
          </label>
          <p>Connecting a {environment === "paper" ? "demo / practice" : "live"} account.</p>
          <div className="inline-actions">
            <button className="button primary" disabled={busy}>
              Connect securely
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setKeyProvider(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="broker-connected">
        <div className="panel-heading">
          <h3>Connected accounts</h3>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} /> Refresh status
          </button>
        </div>
        {!state.connections.length && (
          <p>
            No broker is connected. Manual trades, CSV, and TradingView remain
            available.
          </p>
        )}
        {state.connections.map((c) => (
          <div key={c.id}>
            <div className="broker-account">
              <div>
                <strong>
                  {c.provider} · {c.environment}
                </strong>
                <small>
                  {c.status} ·{" "}
                  {c.last_sync_at
                    ? "Last synced " + new Date(c.last_sync_at).toLocaleString()
                    : "No completed sync"}
                  {c.error_code ? " · " + c.error_code : ""}
                </small>
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
                  disabled={busy}
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
                        {a.environment}
                        {!a.identity_verified
                          ? " · " +
                            (a.metadata.prerequisite ||
                              "Unmasked institution account identity required")
                          : ""}{" "}
                        ·{" "}
                        {job?.error_code ||
                          job?.state ||
                          "History intake requires provider access"}
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

"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronLeft, RefreshCw } from "lucide-react";
import {
  brokerHelp,
  brokerRequest,
  type BrokerActionResult,
  type BrokerState,
} from "./broker-client";

import { connectionTypes, snaptradeBrokerages, snaptradeBlockedReason, type ConnectionType } from "@/lib/brokers/connection-policy";

const guidance: Record<
  string,
  { intro: string; steps: string[]; link?: string; linkLabel?: string }
> = {
  alpaca: {
    intro:
      "Use your normal Alpaca sign-in. You won't need to create an API key.",
    steps: [
      "Choose the live or paper account you want to journal.",
      "Sign in to Alpaca and approve read-only access.",
      "Return here to confirm your account and imported trades.",
    ],
  },
  tastytrade: {
    intro: "Use your tastytrade login with two-factor authentication enabled.",
    steps: [
      "Have your authenticator app or text-message code ready.",
      "Sign in to tastytrade and approve read access.",
      "Return here while we check your accounts and trade history.",
    ],
  },
  tradovate: {
    intro:
      "Use your Tradovate login. Eligible NinjaTrader and prop-firm accounts must use the Tradovate backend.",
    steps: [
      "Choose your live or demo account below.",
      "Sign in on Tradovate's secure page and approve access.",
      "Return here to confirm your account and available fill history.",
    ],
  },
  tradestation: {
    intro:
      "Use your TradeStation login. Account linking is supported; automatic trade imports need additional broker access.",
    steps: [
      "Choose live or simulated trading.",
      "Sign in to TradeStation and approve account access.",
      "Confirm the account here. Use CSV until execution imports are enabled.",
    ],
  },
  projectx: {
    intro:
      "Connect a TopstepX account using a key from your platform settings.",
    steps: [
      "Open TopstepX → Settings → API and enable your API subscription if required.",
      "Create or copy an API key. Have your platform username ready—use your login name, not your email or account number.",
      "Paste those two details below. We will verify your account and import available trades.",
    ],
    link: "https://topstepx.com/settings?tab=api",
    linkLabel: "Open TopstepX API settings",
  },
  oanda: {
    intro:
      "Connect an eligible OANDA v20 account. OANDA Global Markets and TMS accounts use different systems.",
    steps: [
      "Sign in to OANDA account management and open Manage API Access.",
      "Generate a personal access token for the live or practice account you want to journal.",
      "Paste the token below. Keep it private and revoke it in OANDA whenever you want to end access.",
    ],
    link: "https://developer.oanda.com/rest-live-v20/authentication/",
    linkLabel: "Show OANDA's token instructions",
  },
};
export default function BrokerWizard({
  owner,
  state,
  busy,
  onAction,
  onChanged,
  onViewJournal,
  onImportCsv,
}: {
  owner: string;
  state: BrokerState;
  busy: boolean;
  onAction: (payload: unknown) => Promise<BrokerActionResult | undefined>;
  onChanged: () => void;
  onViewJournal?: () => void;
  onImportCsv?: () => void;
}) {
  const [step, setStep] = useState(1),
    [provider, setProvider] = useState("");
  const [connectionType, setConnectionType] = useState<ConnectionType>();
  const [brokerName, setBrokerName] = useState("");
  const [permissions, setPermissions] = useState(false);
  const pendingPayload = useRef<unknown>(null);
  const [environment, setEnvironment] = useState<"live" | "paper">("live");
  const [connectionId, setConnectionId] = useState(""),
    [portal, setPortal] = useState("");
  const [progress, setProgress] = useState<{
    importedExecutions: number;
    historyChecked: boolean;
  }>();
  const [checkError, setCheckError] = useState("");
  const imported = useRef(false),
    resumed = useRef(false);
  const route = state.routes.find((r) => r.id === provider);
  const connection = state.connections.find((c) => c.id === connectionId);
  const accounts = state.accounts.filter(
    (a) => a.connection_id === connectionId,
  );
  const help = guidance[provider];
  useEffect(() => {
    if (resumed.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("broker_error")) {
      setCheckError(
        "Broker sign-in wasn't completed. Choose your broker and try again.",
      );
      resumed.current = true;
    }
    const c = state.connections.find(
      (c) => c.id === params.get("broker_connection"),
    );
    if (c) {
      setConnectionType(c.provider === "snaptrade" ? "snaptrade" : "direct");
      setProvider(c.provider);
      setEnvironment(c.environment === "paper" ? "paper" : "live");
      setConnectionId(c.id);
      setStep(6);
      resumed.current = true;
    }
  }, [state.connections]);
  useEffect(() => {
    if (!connectionId) return;
    let alive = true;
    const check = async () => {
      try {
        const data = await brokerRequest<{
          importedExecutions: number;
          historyChecked: boolean;
        }>({ action: "progress", connectionId });
        if (alive) {
          setProgress(data);
          setCheckError("");
        }
      } catch {
        if (alive)
          setCheckError(
            "We couldn't check the import yet. Use Check again below to retry.",
          );
      }
    };
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 15000);
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [owner, connectionId]);
  useEffect(() => {
    if (progress?.importedExecutions && !imported.current) {
      imported.current = true;
      onChanged();
    }
  }, [progress, onChanged]);
  async function connect(payload: unknown) {
    pendingPayload.current = null;
    const result = await onAction(payload);
    if (result?.connectionId) {
      setConnectionId(result.connectionId);
      setPortal(result.url || "");
      setProgress(undefined);
      imported.current = false;
      setStep(6);
    }
  }
  const reset = () => {
    setProvider("");
    setBrokerName("");
    setConnectionType(undefined);
    setPermissions(false);
    pendingPayload.current = null;
    setStep(1);
    setConnectionId("");
    setPortal("");
    setProgress(undefined);
    setCheckError("");
  };
  return (
    <div className="broker-wizard">
      <ol className="broker-steps" aria-label="Connection steps">
        {["Choose connection type", "Choose broker", "Setup instructions", "Authenticate", "Confirm permissions", "Import or sync", "Connection results"].map(
          (label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={step > i + 1 ? "complete" : ""}
            >
              <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {checkError && (
        <p role="alert" className="banner error">
          {checkError}
        </p>
      )}
      {step === 1 && (
        <>
          <h3>Choose connection type</h3>
          <p>You choose how your own brokerage account connects. No connection type is selected for you.</p>
          <div className="connection-type-grid" role="group" aria-label="Connection type">
            {connectionTypes.map((type) => (
              <button key={type.id} className="connection-type-card" disabled={busy}
                onClick={() => {
                  if (type.id === "csv") {
                    if (onImportCsv) onImportCsv();
                    else document.getElementById("trade-csv")?.scrollIntoView({ behavior: "smooth" });
                    return;
                  }
                  setConnectionType(type.id); setProvider(""); setBrokerName(""); setStep(2);
                }}>
                <strong>{type.name}</strong><span>{type.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <button className="text-button" onClick={reset}><ChevronLeft size={14} /> Change connection type</button>
          <h3>Choose broker · {connectionTypes.find((t) => t.id === connectionType)?.name}</h3>
          {connectionType === "direct" ? (
            <label>Your broker
              <select aria-label="Your broker" value={provider} disabled={busy} onChange={(e) => { setProvider(e.target.value); setEnvironment("live"); }}>
                <option value="">Choose your broker</option>
                {state.routes.filter((r) => r.id !== "snaptrade").map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · Direct{r.available ? " · Setup available" : " · Setup required"}</option>
                ))}
              </select>
            </label>
          ) : connectionType === "snaptrade" ? (
            <label>Your broker in SnapTrade Personal
              <select aria-label="SnapTrade broker" value={brokerName} onChange={(e) => { setBrokerName(e.target.value); setProvider("snaptrade"); }}>
                <option value="">Choose your broker</option>
                {snaptradeBrokerages.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
          ) : (
            <label>Your brokerage or platform
              <input aria-label="Brokerage name" value={brokerName} maxLength={80} onChange={(e) => setBrokerName(e.target.value)} placeholder="Your brokerage name" />
            </label>
          )}
          {route && <div className="broker-capabilities">
            <dl>
              <dt>Connection type</dt><dd>{route.connectionType}</dd>
              <dt>Asset class</dt><dd>{route.assets}</dd>
              <dt>Setup availability</dt><dd>{route.available ? "Available for eligible accounts" : route.unavailableReason}</dd>
              <dt>Credentials / approval</dt><dd>{route.prerequisite}</dd>
              <dt>Historical data</dt><dd>{route.history}</dd>
              <dt>Live session / sync speed</dt><dd>{route.live}</dd>
              <dt>Who pays</dt><dd>{route.payer}</dd>
              <dt>Next action</dt><dd>{route.nextAction}</dd>
            </dl>
            <a href={route.docs} target="_blank" rel="noreferrer">Provider setup documentation <ArrowUpRight size={12} /></a>
          </div>}
          {connectionType === "snaptrade" && <p className="banner" role="status">{snaptradeBlockedReason} <a href="https://docs.snaptrade.com/docs/oauth-apps" target="_blank" rel="noreferrer">SnapTrade OAuth requirements</a></p>}
          {(connectionType === "csv" || connectionType === "tradingview") && <dl className="broker-capabilities">
            <dt>Connection type</dt><dd>{connectionType === "csv" ? "CSV" : "TradingView"}</dd>
            <dt>Asset class</dt><dd>Brokerage equities, options, futures and forex; exact instrument details required</dd>
            <dt>Setup availability</dt><dd>{connectionType === "csv" ? "Available: manual file import" : "Alert setup available with a configured journal backend and an eligible TradingView account"}</dd>
            <dt>Credentials / approval</dt><dd>{connectionType === "csv" ? "Your brokerage CSV export; no broker login shared" : "Your TradingView account with 2FA and webhook access; a Still Signal webhook token"}</dd>
            <dt>Historical data</dt><dd>{connectionType === "csv" ? "The transactions included in your export" : "Future alerts only; import past transactions using CSV"}</dd>
            <dt>Live session / sync speed</dt><dd>{connectionType === "csv" ? "Manual; no live synchronization" : "Real-time provider alert events, subject to delivery delays or failures; not broker execution sync"}</dd>
            <dt>Who pays</dt><dd>{connectionType === "csv" ? "No aggregation service required; user pays any broker export fees" : "User pays any TradingView plan and market-data costs; no Still Signal aggregation subscription"}</dd>
            <dt>Next action</dt><dd>{connectionType === "csv" ? "Export transactions from your brokerage, then open the CSV importer" : "Open alert setup below, generate a webhook token, and configure an alert"}</dd>
          </dl>}
          <button className="button primary" disabled={busy || (connectionType === "direct" ? !provider : !brokerName)} onClick={() => setStep(3)}>Continue <ArrowUpRight size={14} /></button>
          <p><a href="#trade-csv">Import a trade CSV</a> is available for other brokerages.</p>
        </>
      )}
      {step === 3 && (
        <>
          <button className="text-button" onClick={() => setStep(2)}><ChevronLeft size={14} /> Change broker</button>
          <h3>Setup instructions · {route?.name || brokerName}</h3>
          {connectionType === "direct" && route ? <>
            <p>{help?.intro || route.prerequisite}</p>
            <ol className="broker-instructions">{(help?.steps || [route.prerequisite]).map((text) => <li key={text}>{text}</li>)}</ol>
            {!route.available && <p className="banner" role="status">{route.unavailableReason}</p>}
            <a href={help?.link || route.docs} target="_blank" rel="noreferrer">{help?.linkLabel || "Provider setup instructions"}</a>
            <p>Sync reads provider history through the existing worker. It is polling, not a real-time execution stream. Provider execution time and arrival time are recorded separately.</p>
            <button className="button primary" disabled={!route.available || busy} onClick={() => setStep(4)}>Continue to authentication</button>
          </> : connectionType === "snaptrade" ? <>
            <p role="status">{snaptradeBlockedReason}</p>
            <p>Broker support depends on your region and account. Check your brokerage in your own SnapTrade Personal dashboard. Never paste a SnapTrade consumer key into Still Signal.</p>
            <a href="https://support.snaptrade.com/brokerages" target="_blank" rel="noreferrer">Check brokerage eligibility</a>
            <button className="button primary" disabled>Personal OAuth unavailable: app approval and cost review required</button>
            <p><a href="#trade-csv">Import a brokerage CSV</a></p>
          </> : <>
            <p>{connectionType === "csv" ? "Export your brokerage transactions, select the file, review column mappings and timestamps, confirm the timezone, then import. Results appear in your journal." : "Still Signal cannot reuse a broker login from TradingView. Generate your webhook token below, sign in to TradingView with 2FA, and create a supported price, indicator or Pine strategy alert. Confirm the URL and message, then check delivery status after it fires. Alerts are signals or events, not guaranteed broker fills. Manual broker trades require direct sync or CSV."}</p>
            <a className="button primary" href={connectionType === "csv" ? "#trade-csv" : "#tradingview-setup"}>{connectionType === "csv" ? "Open CSV importer" : "Open TradingView alert setup"} <ArrowUpRight size={14} /></a>
          </>}
        </>
      )}
      {step === 4 && route && help && (
        <>
          <button className="text-button" disabled={busy} onClick={() => setStep(2)}>
            <ChevronLeft size={14} /> Change broker
          </button>
          <h3>Connect {route.name}</h3>
          <p>{help.intro}</p>
          <ol className="broker-instructions">
            {help.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {help.link && (
            <a
              className="button small-button"
              href={help.link}
              target="_blank"
              rel="noreferrer"
            >
              {help.linkLabel} <ArrowUpRight size={14} />
            </a>
          )}
          <label>
            Account type
            <select
              aria-label="Broker account type"
              value={environment}
              disabled={busy}
              onChange={(e) =>
                setEnvironment(e.target.value as "live" | "paper")
              }
            >
              <option value="live">Live account</option>
              <option
                value="paper"
                disabled={!route.environments?.includes("paper")}
              >
                Demo / practice account
              </option>
            </select>
          </label>
          {route.method === "key" ? (
            <form
              key={provider + environment}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const payload = {
                  action: "connect",
                  provider,
                  environment,
                  accessToken: f.get("accessToken") || undefined,
                  apiKey: f.get("apiKey") || undefined,
                  userName: f.get("userName") || undefined,
                };
                e.currentTarget.reset();
                pendingPayload.current = { ...payload, connectionType: "direct" };
                setPermissions(false);
                setStep(5);
              }}
            >
              {provider === "projectx" && (
                <label>
                  Platform username
                  <input
                    name="userName"
                    autoComplete="off"
                    required
                    maxLength={120}
                    disabled={busy}
                  />
                </label>
              )}
              <label>
                {provider === "oanda" ? "API token" : "API key"}
                <input
                  name={provider === "oanda" ? "accessToken" : "apiKey"}
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={8192}
                  disabled={busy}
                />
              </label>
              <small>
                Your key is encrypted on the server. These native keys may
                include trading permissions; Still Signal only reads data.
              </small>
              <button className="button primary" disabled={busy}>
                Review permissions
              </button>
            </form>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                pendingPayload.current = { action: "connect", connectionType: "direct", provider, environment };
                setPermissions(false);
                setStep(5);
              }}
            >
              Review permissions{" "}
              <ArrowUpRight size={14} />
            </button>
          )}
        </>
      )}
      {step === 5 && route && (
        <>
          <h3>Confirm permissions</h3>
          <p>Connect only an account you own. Still Signal reads accounts and transaction history for your journal and does not place orders. Native API tokens may include trading privileges; revoke them at the broker to end access.</p>
          <p>{route.payer}</p>
          <label className="checkbox-label"><input type="checkbox" checked={permissions} onChange={(e) => setPermissions(e.target.checked)} /> I authorize reading my account and available transaction history.</label>
          <button className="button primary" disabled={busy || !permissions || !pendingPayload.current} onClick={() => void connect(pendingPayload.current)}>{busy ? "Preparing connection…" : "Connect account"}</button>
          <button className="text-button" disabled={busy} onClick={() => { pendingPayload.current = null; setStep(4); }}>Back to authentication</button>
          {!pendingPayload.current && !busy && <p role="status">If the connection failed, return to authentication and enter your credentials again.</p>}
        </>
      )}
      {(step === 6 || step === 7) && (
        <>
          <h3>
            {progress?.importedExecutions && connection?.status === "connected"
              ? "Your first trades are in"
              : "Let's confirm your connection"}
          </h3>
          {portal && (
            <>
              <p>
                Complete sign-in and approval in the broker tab. Recording
                continues here.
              </p>
              <a
                className="button primary"
                href={portal}
                target="_blank"
                rel="noreferrer"
              >
                Continue to secure sign-in <ArrowUpRight size={14} />
              </a>
            </>
          )}
          <ul className="broker-checks">
            <li>
              <span>{connection?.status === "connected" ? "✓" : "○"}</span>
              Broker authorization{" "}
              {connection?.status === "connected" ? "confirmed" : "waiting"}
            </li>
            <li>
              <span>{accounts.length ? "✓" : "○"}</span>
              {accounts.length
                ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} found`
                : "Waiting for your accounts"}
            </li>
            <li>
              <span>{progress?.importedExecutions ? "✓" : "○"}</span>
              {progress?.importedExecutions
                ? `${progress.importedExecutions} execution${progress.importedExecutions === 1 ? "" : "s"} imported`
                : progress?.historyChecked
                  ? "No trades imported yet. New accounts may have no history."
                  : "Waiting for the first trade import"}
            </li>
          </ul>
          {connection?.error_code && (
            <p role="status">{brokerHelp(connection.error_code)}</p>
          )}
          {state.jobs
            .filter(
              (j) =>
                accounts.some((a) => a.id === j.account_id) && j.error_code,
            )
            .map((j) => (
              <p role="status" key={j.account_id}>
                {brokerHelp(j.error_code)}
              </p>
            ))}
          {accounts.map((a) => (
            <p className="broker-account-summary" key={a.id}>
              {a.name} · {a.metadata.maskedNumber} ·{" "}
              {a.environment === "paper" ? "Demo / practice" : "Live"}
              {!a.identity_verified &&
                " · Account identity needs review before import"}
            </p>
          ))}
          <p className="muted">
            {progress?.importedExecutions
              ? "Your imported trades are ready in your journal."
              : "We check your broker's actual history before confirming your first import."}
            {" "}History imports use polling. Execution timestamps come from your broker; arrival timestamps record when Still Signal receives them.
          </p>
          {!!progress?.importedExecutions &&
            connection?.status === "connected" &&
            onViewJournal && (
              <button className="button primary" onClick={onViewJournal}>
                View journal <ArrowUpRight size={14} />
              </button>
            )}
          {step === 6 && <button className="button primary" onClick={() => setStep(7)}>Show connection status and journal results</button>}
          <div className="inline-actions">
            <button
              className="button small-button"
              disabled={busy}
              onClick={async () => {
                const result = await onAction({
                  action: "refresh",
                  connectionId,
                });
                if (result) {
                  try {
                    setProgress(
                      await brokerRequest({ action: "progress", connectionId }),
                    );
                    setCheckError("");
                  } catch {
                    setCheckError(
                      "The status check failed. Try again shortly.",
                    );
                  }
                }
              }}
            >
              <RefreshCw size={14} />{" "}
              {portal ? "I've finished signing in" : "Check again"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                pendingPayload.current = null;
                setStep(4);
                setConnectionId("");
                setPortal("");
                setProgress(undefined);
              }}
            >
              Retry sign-in
            </button>
            <button className="text-button" disabled={busy} onClick={reset}>
              Connect another broker
            </button>
          </div>
        </>
      )}
    </div>
  );
}

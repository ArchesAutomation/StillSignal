"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronLeft, RefreshCw } from "lucide-react";
import {
  brokerHelp,
  brokerRequest,
  type BrokerActionResult,
  type BrokerState,
} from "./broker-client";

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
}: {
  owner: string;
  state: BrokerState;
  busy: boolean;
  onAction: (payload: unknown) => Promise<BrokerActionResult | undefined>;
  onChanged: () => void;
  onViewJournal?: () => void;
}) {
  const [step, setStep] = useState(1),
    [provider, setProvider] = useState("");
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
      setProvider(c.provider);
      setEnvironment(c.environment === "paper" ? "paper" : "live");
      setConnectionId(c.id);
      setStep(3);
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
    const result = await onAction(payload);
    if (result?.connectionId) {
      setConnectionId(result.connectionId);
      setPortal(result.url || "");
      setProgress(undefined);
      imported.current = false;
      setStep(3);
    }
  }
  const reset = () => {
    setStep(1);
    setConnectionId("");
    setPortal("");
    setProgress(undefined);
    setCheckError("");
  };
  return (
    <div className="broker-wizard">
      <ol className="broker-steps" aria-label="Connection steps">
        {["Choose broker", "Connect securely", "Confirm import"].map(
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
          <h3>Which broker do you use?</h3>
          <p>
            Keep trading in your usual platform. We'll read your account history
            for your journal.
          </p>
          <label>
            Your broker
            <select
              value={provider}
              disabled={busy}
              onChange={(e) => {
                setProvider(e.target.value);
                setEnvironment("live");
              }}
            >
              <option value="">Choose your broker</option>
              {state.routes
                .filter(
                  (r) => r.method !== "unavailable" && r.id !== "snaptrade",
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.available ? "" : " · coming soon"}
                  </option>
                ))}
            </select>
          </label>
          {route && !route.available && (
            <div className="banner" role="status">
              This connection isn't enabled in Trade Pulse yet. You don't need a
              developer account. <a href="#trade-csv">Import a CSV</a> while we
              finish setting it up.
            </div>
          )}
          <button
            className="button primary"
            disabled={!route?.available || busy}
            onClick={() => setStep(2)}
          >
            Continue <ArrowUpRight size={14} />
          </button>
          <details>
            <summary>Don't see your broker?</summary>
            <p>
              Some broker APIs need a separate agreement or a desktop bridge.{" "}
              <a href="#trade-csv">Import a trade CSV</a> to start journaling
              now.
            </p>
          </details>
        </>
      )}
      {step === 2 && route && help && (
        <>
          <button className="text-button" disabled={busy} onClick={reset}>
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
                void connect(payload);
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
                include trading permissions; Trade Pulse only reads data.
              </small>
              <button className="button primary" disabled={busy}>
                {busy ? "Checking connection…" : "Connect securely"}
              </button>
            </form>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void connect({ action: "connect", provider, environment })
              }
            >
              {busy ? "Preparing sign-in…" : "Connect account"}{" "}
              <ArrowUpRight size={14} />
            </button>
          )}
        </>
      )}
      {step === 3 && (
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
          </p>
          {!!progress?.importedExecutions &&
            connection?.status === "connected" &&
            onViewJournal && (
              <button className="button primary" onClick={onViewJournal}>
                View journal <ArrowUpRight size={14} />
              </button>
            )}
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
                setStep(2);
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

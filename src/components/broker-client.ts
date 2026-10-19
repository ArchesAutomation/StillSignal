import { authClient } from "@/lib/cloud";
import type { routeAvailability } from "@/lib/brokers/registry";
import type { BrokerProvider } from "@/lib/brokers/model";
export type BrokerState = {
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
export type BrokerActionResult = {
  url?: string;
  queued?: boolean;
  message?: string;
  connectionId?: string;
};
export async function brokerRequest<T>(payload: unknown): Promise<T> {
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
export function brokerHelp(code?: string): string {
  if (!code) return "";
  if (/SNAPTRADE_PERSONAL_OAUTH/.test(code))
    return "SnapTrade sync is disabled pending an approved Personal OAuth app and cost review. Use CSV; revoke legacy access in your SnapTrade dashboard.";
  if (/NO_ACCOUNTS/.test(code))
    return "Your broker returned no eligible accounts. Check the account type and permissions, then try again.";
  if (/REAUTH|ACCESS_3/.test(code))
    return "Sign in again to restore access to your account.";
  if (/RATE_LIMIT/.test(code))
    return "Your broker is busy. We'll retry automatically.";
  if (/TRADESTATION_EXECUTION/.test(code))
    return "Your account can be linked. Automatic trade imports need additional broker access; use CSV for now.";
  if (/UNRESOLVED|CONTRACT|RECONCILIATION|REVISION/.test(code))
    return "Some trade details need review. Your existing journal is safe; import a CSV while we check this connection.";
  if (/PROJECTX_ACCESS_7/.test(code))
    return "Sign in to TopstepX and accept the pending agreements, then try again.";
  if (/PROJECTX_ACCESS_9/.test(code))
    return "Enable your TopstepX API subscription before connecting.";
  if (/REQUIRED/.test(code))
    return "Additional broker access is needed before trades can be imported. You can use CSV in the meantime.";
  return "We couldn't complete the broker check. Retry the connection or use CSV for now.";
}

import { randomBytes } from "node:crypto";
import { checked, type service } from "../server.ts";
import { brokerAdapter } from "./adapters.ts";
import {
  encryptCredentials,
  decryptCredentials,
  accountIdentity,
  digest,
} from "./security.ts";
import { refreshCredentials } from "./oauth.ts";
import type { BrokerCredentials, BrokerProvider, BrokerAccount } from "./model.ts";
export type BrokerDb = ReturnType<typeof service>;
export async function credentialsFor(
  db: BrokerDb,
  userId: string,
  connectionId: string,
  provider: BrokerProvider,
) {
  const result = await db
    .from("pulse_broker_secrets")
    .select("ciphertext")
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .single();
  checked(result.error);
  const old = decryptCredentials(result.data!.ciphertext),
    credentials = await refreshCredentials(provider, old);
  if (JSON.stringify(old) !== JSON.stringify(credentials))
    await saveCredentials(db, userId, connectionId, credentials);
  return credentials;
}
export async function saveCredentials(
  db: BrokerDb,
  userId: string,
  connectionId: string,
  credentials: BrokerCredentials,
) {
  const result = await db
    .from("pulse_broker_secrets")
    .upsert({
      connection_id: connectionId,
      user_id: userId,
      ciphertext: encryptCredentials(credentials),
      updated_at: new Date().toISOString(),
    });
  checked(result.error);
}
export async function newConnection(
  db: BrokerDb,
  userId: string,
  provider: BrokerProvider,
  environment: "live" | "paper",
) {
  const result = await db
    .from("pulse_broker_connections")
    .upsert(
      {
        user_id: userId,
        provider,
        environment,
        status: "pending",
        error_code: null,
      },
      { onConflict: "user_id,provider,environment" },
    )
    .select("id")
    .single();
  checked(result.error);
  return result.data!.id as string;
}
export async function queueDiscovery(
  db: BrokerDb,
  userId: string,
  connectionId: string,
) {
  const old = await db
    .from("pulse_broker_discovery")
    .select("state")
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .maybeSingle();
  checked(old.error);
  if (old.data?.state === "leased") return;
  const result = await db
    .from("pulse_broker_discovery")
    .upsert({
      user_id: userId,
      connection_id: connectionId,
      state: "queued",
      run_after: new Date().toISOString(),
      error_code: null,
    });
  checked(result.error);
}
export async function discoverAccounts(
  db: BrokerDb,
  userId: string,
  connectionId: string,
  provider: BrokerProvider,
  credentials: BrokerCredentials,
) {
  const accounts = await brokerAdapter(provider).accounts(credentials);
  const known = await db
    .from("pulse_broker_accounts")
    .select("canonical_key,institution,environment,connection_id")
    .eq("user_id", userId);
  checked(known.error);
  for (const a of accounts) {
    const canonical = accountIdentity(
      userId,
      a.institution + ":" + a.environment,
      a.number || a.providerId,
    );
    const existing = await db
      .from("pulse_broker_accounts")
      .select("id,connection_id")
      .eq("user_id", userId)
      .eq("canonical_key", canonical)
      .maybeSingle();
    checked(existing.error);
    // An alternate connection cannot acquire intake authority for the same account.
    if (existing.data && existing.data.connection_id !== connectionId) continue;
    const mixedRoute = (known.data || []).some(
      (old) =>
        old.connection_id !== connectionId &&
        old.environment === a.environment &&
        old.institution.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          a.institution.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    const verified = a.identityVerified && !mixedRoute;
    const result = await db
      .from("pulse_broker_accounts")
      .upsert(
        {
          ...(existing.data ? { id: existing.data.id } : {}),
          user_id: userId,
          connection_id: connectionId,
          provider_account_id: a.providerId,
          canonical_key: canonical,
          institution: a.institution,
          name: a.name,
          currency: a.currency,
          environment: a.environment,
          identity_verified: verified,
          metadata: {
            maskedNumber: "••••" + a.number.slice(-4),
            ...(mixedRoute
              ? {
                  prerequisite:
                    "Cross-route account identity must be reconciled before intake.",
                }
              : {}),
          },
          enabled: true,
        },
        { onConflict: "user_id,canonical_key" },
      )
      .select("id")
      .single();
    checked(result.error);
    if (
      verified &&
      provider !== "tradestation" &&
      (provider !== "snaptrade" || Deno.env.get("SNAPTRADE_STABLE_IDS") === "true")
    ) {
      const job = await db
        .from("pulse_broker_jobs")
        .upsert(
          { user_id: userId, account_id: result.data!.id },
          { onConflict: "user_id,account_id", ignoreDuplicates: true },
        );
      checked(job.error);
    }
  }
  const result = await db
    .from("pulse_broker_connections")
    .update({
      status: "connected",
      capabilities: {
        executions: provider !== "tradestation",
        freshness: provider === "snaptrade" ? "daily" : "periodic",
        intervalSeconds: provider === "snaptrade" ? 21600 : 60,
      },
      error_code:
        provider === "tradestation"
          ? "TRADESTATION_EXECUTION_FEED_REQUIRED"
          : provider === "snaptrade" &&
              Deno.env.get("SNAPTRADE_STABLE_IDS") !== "true"
            ? "SNAPTRADE_STABLE_IDS_REQUIRED"
            : null,
    })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .neq("status", "revoked");
  checked(result.error);
  return accounts.length;
}
export async function beginOauth(
  db: BrokerDb,
  userId: string,
  connectionId: string,
) {
  const state = randomBytes(32).toString("hex");
  const result = await db
    .from("pulse_broker_oauth")
    .insert({
      state_hash: digest(state),
      user_id: userId,
      connection_id: connectionId,
      expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
    });
  checked(result.error);
  return state;
}
export function accountFromRow(row: Record<string, any>): BrokerAccount {
  return {
    id: row.id,
    providerId: row.provider_account_id,
    institution: row.institution,
    number: "",
    name: row.name,
    currency: row.currency,
    environment: row.environment,
    identityVerified: row.identity_verified,
  };
}

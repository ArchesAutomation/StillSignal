import { randomUUID } from "node:crypto";
import { checked } from "../server";
import { brokerAdapter } from "./adapters";
import {
  accountFromRow,
  credentialsFor,
  discoverAccounts,
  type BrokerDb,
} from "./service";
import { normalizeExecution } from "./normalize";
import { ProviderError } from "./http";
export async function runBrokerDiscovery(db: BrokerDb) {
  const lease = randomUUID(),
    claimed = await db.rpc("pulse_claim_broker_discovery", { p_lease: lease });
  checked(claimed.error);
  const job = claimed.data?.[0];
  if (!job) return false;
  try {
    const c = await db
      .from("pulse_broker_connections")
      .select("*")
      .eq("id", job.connection_id)
      .eq("user_id", job.user_id)
      .neq("status", "revoked")
      .single();
    checked(c.error);
    await discoverAccounts(
      db,
      job.user_id,
      job.connection_id,
      c.data!.provider,
      await credentialsFor(
        db,
        job.user_id,
        job.connection_id,
        c.data!.provider,
      ),
    );
    const done = await db
      .from("pulse_broker_discovery")
      .delete()
      .eq("connection_id", job.connection_id)
      .eq("user_id", job.user_id)
      .eq("lease", lease);
    checked(done.error);
  } catch (error) {
    const code =
      error instanceof ProviderError ? error.code : "DISCOVERY_FAILED";
    const result = await db
      .from("pulse_broker_discovery")
      .update({
        state: /REAUTH|ACCESS|REQUIRED/.test(code) ? "paused" : "queued",
        lease: null,
        leased_until: null,
        attempts: Number(job.attempts) + 1,
        error_code: code,
        run_after: new Date(
          Date.now() + Math.min(86400, 60 * 2 ** Number(job.attempts)) * 1000,
        ).toISOString(),
      })
      .eq("connection_id", job.connection_id)
      .eq("user_id", job.user_id)
      .eq("lease", lease);
    checked(result.error);
    const c = await db
      .from("pulse_broker_connections")
      .update({ status: "error", error_code: code })
      .eq("id", job.connection_id)
      .eq("user_id", job.user_id)
      .neq("status", "revoked");
    checked(c.error);
  }
  return true;
}
export async function runBrokerJob(db: BrokerDb) {
  const lease = randomUUID(),
    claimed = await db.rpc("pulse_claim_broker_job", { p_lease: lease });
  checked(claimed.error);
  const job = claimed.data?.[0];
  if (!job) return false;
  try {
    const account = await db
      .from("pulse_broker_accounts")
      .select("*")
      .eq("id", job.account_id)
      .eq("user_id", job.user_id)
      .single();
    checked(account.error);
    const a = account.data!,
      connection = await db
        .from("pulse_broker_connections")
        .select("*")
        .eq("id", a.connection_id)
        .eq("user_id", job.user_id)
        .eq("status", "connected")
        .single();
    checked(connection.error);
    const c = connection.data!,
      credentials = await credentialsFor(db, job.user_id, c.id, c.provider);
    const page = await brokerAdapter(c.provider).executions(
      credentials,
      accountFromRow(a),
      job.cursor,
    );
    if (page.records.length > 250) throw new ProviderError("PAGE_TOO_LARGE");
    const records = page.records.map((fill) =>
      normalizeExecution(fill, {
        userId: job.user_id,
        accountId: a.id,
        connectionId: c.id,
        provider: c.provider,
        receivedAt: Date.now(),
      }),
    );
    const result = await db.rpc("pulse_ingest_broker_page", {
      p_user: job.user_id,
      p_account: a.id,
      p_job: job.id,
      p_lease: lease,
      p_records: records,
      p_cursor: page.cursor,
      p_complete: page.complete,
    });
    checked(result.error);
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "SYNC_FAILED";
    const pause = /REAUTH|REQUIRED|UNRESOLVED|CONTRACT_CHANGED|REVISION/.test(
      code,
    );
    const retry = error instanceof ProviderError ? error.retryAfter : 60;
    const delay = Math.min(
      86400,
      Math.max(retry, 2 ** Math.min(12, Number(job.attempts) + 1) * 15),
    );
    const result = await db
      .from("pulse_broker_jobs")
      .update({
        state: pause ? "paused" : "queued",
        attempts: Number(job.attempts) + 1,
        error_code: code,
        run_after: new Date(
          Date.now() + delay * 1000 + Math.random() * 1000,
        ).toISOString(),
        lease: null,
        leased_until: null,
      })
      .eq("id", job.id)
      .eq("lease", lease)
      .eq("user_id", job.user_id);
    checked(result.error);
    if (code === "PROVIDER_REAUTH") {
      const result = await db
        .from("pulse_broker_connections")
        .update({ status: "disabled", error_code: code })
        .eq(
          "id",
          (
            await db
              .from("pulse_broker_accounts")
              .select("connection_id")
              .eq("id", job.account_id)
              .eq("user_id", job.user_id)
              .single()
          ).data?.connection_id,
        )
        .eq("user_id", job.user_id);
      checked(result.error);
    }
  }
  return true;
}

import { z } from "zod";
import { authenticated, checked, failure, rate, service } from "@/lib/server";
import { boundedJson } from "@/lib/validation";
import { routeAvailability } from "@/lib/brokers/registry";
import { snapRequest } from "@/lib/brokers/snaptrade";
import { trustedPortal, digest } from "@/lib/brokers/security";
import {
  beginOauth,
  credentialsFor,
  newConnection,
  saveCredentials,
  queueDiscovery,
} from "@/lib/brokers/service";
import { authorizeUrl, callbackUrl, exchangeCode } from "@/lib/brokers/oauth";
import { projectxLogin } from "@/lib/brokers/projectx";
import { brokerAdapter } from "@/lib/brokers/adapters";
import { ProviderError } from "@/lib/brokers/http";
import type { BrokerCredentials } from "@/lib/brokers/model";
const providers = z.enum([
  "snaptrade",
  "tradestation",
  "tradovate",
  "ibkr",
  "projectx",
  "rithmic",
  "oanda",
]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("catalog") }),
  z.object({
    action: z.literal("connect"),
    provider: providers,
    environment: z.enum(["live", "paper"]).default("paper"),
    broker: z.string().max(80).optional(),
    accessToken: z.string().max(8192).optional(),
    userName: z.string().max(120).optional(),
    apiKey: z.string().max(8192).optional(),
  }),
  z.object({ action: z.literal("refresh"), connectionId: z.uuid() }),
  z.object({ action: z.literal("disconnect"), connectionId: z.uuid() }),
  z.object({ action: z.literal("sync"), accountId: z.uuid() }),
  z.object({
    action: z.literal("callback"),
    state: z.string().regex(/^[a-f0-9]{64}$/),
    code: z.string().min(1).max(8192),
  }),
]);
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const body = schema.parse(await boundedJson(request, 30000));
    if (body.action === "callback") {
      const db = service();
      const state = await db.rpc("pulse_consume_broker_oauth", {
        p_hash: digest(body.state),
      });
      checked(state.error);
      if (!state.data?.length) throw new Error("UNAUTHORIZED");
      const row = state.data[0],
        connection = await db
          .from("pulse_broker_connections")
          .select("*")
          .eq("id", row.connection_id)
          .eq("user_id", row.user_id)
          .eq("status", "pending")
          .single();
      checked(connection.error);
      const c = connection.data!;
      const credentials = await exchangeCode(
        c.provider,
        body.code,
        c.environment,
      );
      await saveCredentials(db, row.user_id, row.connection_id, credentials);
      await queueDiscovery(db, row.user_id, row.connection_id);
      return json({ ok: true });
    }
    const { db, user } = await authenticated(request);
    await rate(db, "broker:" + user.id, 30);
    const routes = routeAvailability(process.env);
    if (body.action === "status") {
      const [connections, accounts, jobs] = await Promise.all([
        db
          .from("pulse_broker_connections")
          .select(
            "id,provider,status,environment,last_sync_at,error_code,capabilities",
          )
          .eq("user_id", user.id),
        db
          .from("pulse_broker_accounts")
          .select(
            "id,connection_id,institution,name,currency,environment,identity_verified,enabled,metadata",
          )
          .eq("user_id", user.id),
        db
          .from("pulse_broker_jobs")
          .select("account_id,state,run_after,error_code,attempts")
          .eq("user_id", user.id),
      ]);
      for (const r of [connections, accounts, jobs]) checked(r.error);
      return json({
        routes,
        connections: connections.data,
        accounts: accounts.data,
        jobs: jobs.data,
      });
    }
    if (body.action === "catalog") {
      if (!routes.find((r) => r.id === "snaptrade")?.available)
        return json({
          institutions: [],
          message: "Commercial SnapTrade access is not configured.",
        });
      const info = await snapRequest("/snapTrade/partners");
      return json({
        institutions: (info.allowed_brokerages || []).map(
          (b: { slug: string; name: string }) => ({
            slug: b.slug,
            name: b.name,
          }),
        ),
      });
    }
    if (body.action === "connect") {
      const route = routes.find((r) => r.id === body.provider)!;
      if (!route.available) return json({ error: route.prerequisite }, 503);
      if (body.provider === "oanda" && !body.accessToken)
        return json({ error: "Enter your OANDA API token." }, 400);
      if (body.provider === "projectx" && (!body.apiKey || !body.userName))
        return json(
          { error: "Enter your platform username and API key." },
          400,
        );
      const connectionId = await newConnection(
        db,
        user.id,
        body.provider,
        body.provider === "snaptrade" ? "live" : body.environment,
      );
      if (body.provider === "snaptrade") {
        let credentials;
        const existing = await db
          .from("pulse_broker_secrets")
          .select("ciphertext")
          .eq("user_id", user.id)
          .eq("connection_id", connectionId)
          .maybeSingle();
        checked(existing.error);
        if (existing.data)
          credentials = await credentialsFor(
            db,
            user.id,
            connectionId,
            body.provider,
          );
        else {
          // SnapTrade ID is stable and tenant-scoped; registration conflicts need reconciliation, not duplicate users.
          const result = await snapRequest(
            "/snapTrade/registerUser",
            undefined,
            { userId: "pulse-" + user.id },
          );
          credentials = {
            userId: result.userId,
            userSecret: result.userSecret,
          };
          if (!credentials.userSecret)
            throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
          await saveCredentials(db, user.id, connectionId, credentials);
        }
        const catalog = await snapRequest("/snapTrade/partners");
        if (
          body.broker &&
          !catalog.allowed_brokerages.some(
            (b: { slug: string }) => b.slug === body.broker,
          )
        )
          return json(
            { error: "That institution is not enabled for this application." },
            400,
          );
        const login = await snapRequest("/snapTrade/login", credentials, {
          connectionType: "read",
          customRedirect: callbackUrl().replace(
            "/api/brokers/callback",
            "/?broker_return=1",
          ),
          immediateRedirect: true,
          ...(body.broker ? { broker: body.broker } : {}),
        });
        return json({ url: trustedPortal(login.redirectURI), connectionId });
      }
      if (route.method === "oauth")
        return json({
          url: authorizeUrl(
            body.provider,
            await beginOauth(db, user.id, connectionId),
          ),
          connectionId,
        });
      let credentials: BrokerCredentials = {
        accessToken: body.accessToken,
        userName: body.userName,
        apiKey: body.apiKey,
        environment: body.environment,
      };
      if (body.provider === "projectx")
        credentials = await projectxLogin(credentials);
      await saveCredentials(db, user.id, connectionId, credentials);
      await queueDiscovery(db, user.id, connectionId);
      return json({
        queued: true,
        message:
          "Credentials saved. Account verification and available history import are queued.",
      });
    }
    if (body.action === "sync") {
      const account = await db
        .from("pulse_broker_accounts")
        .select("id,connection_id,identity_verified")
        .eq("id", body.accountId)
        .eq("user_id", user.id)
        .eq("enabled", true)
        .single();
      checked(account.error);
      if (!account.data?.identity_verified)
        return json(
          { error: "Account identity must be verified before syncing." },
          409,
        );
      // Update existing jobs only; unavailable intake routes cannot be activated by this button.
      const result = await db
        .from("pulse_broker_jobs")
        .update({
          state: "queued",
          run_after: new Date().toISOString(),
          error_code: null,
        })
        .eq("user_id", user.id)
        .eq("account_id", body.accountId)
        .is("lease", null)
        .select("id");
      checked(result.error);
      return result.data?.length
        ? json({ queued: true })
        : json(
            {
              error:
                "Synchronization is unavailable or already in progress. Check the route prerequisites.",
            },
            409,
          );
    }
    const result = await db
      .from("pulse_broker_connections")
      .select("*")
      .eq("id", body.connectionId)
      .eq("user_id", user.id)
      .single();
    checked(result.error);
    const c = result.data!;
    if (body.action === "refresh") {
      await queueDiscovery(db, user.id, c.id);
      return json({
        queued: true,
        message:
          "Account verification queued. Refresh status after the worker completes it.",
      });
    }
    if (body.action === "disconnect") {
      const update = await db
        .from("pulse_broker_connections")
        .update({ status: "revoked" })
        .eq("id", c.id)
        .eq("user_id", user.id);
      checked(update.error);
      const pauseDiscovery = await db
        .from("pulse_broker_discovery")
        .update({ state: "paused", lease: null, leased_until: null })
        .eq("user_id", user.id)
        .eq("connection_id", c.id);
      checked(pauseDiscovery.error);
      // Pause locally before remote revoke; a provider outage must not resume intake.
      const accounts = await db
        .from("pulse_broker_accounts")
        .select("id")
        .eq("connection_id", c.id)
        .eq("user_id", user.id);
      checked(accounts.error);
      for (const a of accounts.data || []) {
        const paused = await db
          .from("pulse_broker_jobs")
          .update({ state: "paused", lease: null, leased_until: null })
          .eq("account_id", a.id)
          .eq("user_id", user.id);
        checked(paused.error);
      }
      let revokePending = false;
      try {
        await brokerAdapter(c.provider).disconnect?.(
          await credentialsFor(db, user.id, c.id, c.provider),
        );
      } catch {
        revokePending = true;
      }
      if (!revokePending) {
        const removed = await db
          .from("pulse_broker_secrets")
          .delete()
          .eq("connection_id", c.id)
          .eq("user_id", user.id);
        checked(removed.error);
      }
      return json({
        ok: true,
        revokePending,
        message: revokePending
          ? "Sync stopped. Provider revocation could not be confirmed; retry disconnect or revoke access at your provider."
          : "Sync stopped. Revoke native tokens at your provider to invalidate their underlying grant.",
      });
    }
    throw new Error("INVALID_ACTION");
  } catch (e) {
    if (e instanceof ProviderError)
      return json(
        {
          error:
            "Broker request failed: " +
            e.code +
            ". Your existing journal remains available.",
        },
        503,
      );
    return failure(e);
  }
}

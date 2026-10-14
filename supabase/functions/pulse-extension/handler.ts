import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { extensionActionSchema } from "./journal-command.ts";
import { boundedJson } from "./validation.ts";
import { authenticated, service, rate, checked } from "./server.ts";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const p = extensionActionSchema.parse(await boundedJson(request, 4100000));
    if (["pair", "connections", "revoke"].includes(p.action)) {
      const { db, user } = await authenticated(request);
      await rate(db, "extension-pair:" + user.id, 20);
      if (p.action === "pair") {
        const code = randomBytes(32).toString("hex");
        checked(
          (
            await db.from("pulse_extension_pairings").insert({
              code_hash: hash(code),
              user_id: user.id,
              identity: user.email || user.id,
              instance_id: p.instanceId,
              extension_id: p.extensionId,
              challenge: p.challenge,
              expires_at: new Date(Date.now() + 120000).toISOString(),
            })
          ).error,
        );
        return response({
          code,
          expiresAt: Date.now() + 120000,
          userId: user.id,
        });
      }
      if (p.action === "revoke") {
        checked(
          (
            await db
              .from("pulse_extension_credentials")
              .update({ revoked_at: new Date().toISOString() })
              .eq("id", p.credentialId)
              .eq("user_id", user.id)
          ).error,
        );
        return response({ ok: true });
      }
      const { data, error } = await db
        .from("pulse_extension_credentials")
        .select("id,instance_id,expires_at,revoked_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      checked(error);
      return response({ connections: data });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    const instance = request.headers.get("x-extension-instance");
    if (
      p.action !== "exchange" &&
      (!token?.match(/^tp_ext_[a-f0-9]{64}$/) ||
        !instance?.match(/^[a-f0-9-]{36}$/))
    )
      throw new Error("UNAUTHORIZED");
    const db = service();
    if (p.action === "exchange") {
      await rate(db, "extension-exchange:" + hash(p.instanceId), 10);
      const token = "tp_ext_" + randomBytes(32).toString("hex");
      const { data, error } = await db.rpc("pulse_extension_exchange", {
        p_code_hash: hash(p.code),
        p_instance: p.instanceId,
        p_challenge: hash(p.secret),
        p_token_hash: hash(token),
        p_id: randomUUID(),
      });
      if (error)
        throw new Error(
          error.message.includes("unauthorized") ? "UNAUTHORIZED" : "DATABASE",
        );
      return response({ ...data, token });
    }
    if (
      !token?.match(/^tp_ext_[a-f0-9]{64}$/) ||
      !instance?.match(/^[a-f0-9-]{36}$/)
    )
      throw new Error("UNAUTHORIZED");
    const { data: credential, error: ce } = await db
      .from("pulse_extension_credentials")
      .select("id,user_id,expires_at,revoked_at")
      .eq("token_hash", hash(token))
      .eq("instance_id", instance)
      .maybeSingle();
    checked(ce);
    if (
      !credential ||
      credential.revoked_at ||
      Date.parse(credential.expires_at) <= Date.now()
    )
      throw new Error("UNAUTHORIZED");
    await rate(
      db,
      (p.action === "transcribe" ? "extension-audio:" : "extension:") +
        credential.id,
      p.action === "transcribe" ? 12 : 120,
    );
    if (p.action === "transcribe") {
      const groqKey = Deno.env.get("GROQ_API_KEY");
      const key = groqKey || Deno.env.get("VOICE_TRANSCRIPTION_API_KEY");
      if (!key)
        return response(
          {
            error:
              "Remote transcription is not configured. Your recording remains on this device until retry or cancel.",
          },
          503,
        );
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p.audio)) throw new Error("INVALID");
      const bytes = Buffer.from(p.audio, "base64");
      if (bytes.length > 3000000) throw new Error("TOO_LARGE");
      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes], { type: p.mime }),
        "reflection." +
          (p.mime === "audio/mp4"
            ? "mp4"
            : p.mime === "audio/ogg"
              ? "ogg"
              : "webm"),
      );
      form.append("model", groqKey ? "whisper-large-v3-turbo" : "whisper-1");
      form.append("response_format", "verbose_json");
      // No prompt text: avoid turning silence into an invented journal entry.
      const upstream = await fetch(
        groqKey
          ? "https://api.groq.com/openai/v1/audio/transcriptions"
          : "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + key },
          body: form,
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!upstream.ok)
        return response(
          {
            error: "Transcription failed. Retry or cancel the local recording.",
          },
          503,
        );
      const result = (await upstream.json()) as {
        text?: string;
        segments?: { no_speech_prob?: number; avg_logprob?: number }[];
      };
      const text = result.text?.trim() || "";
      const review =
        !text ||
        text.length > 2000 ||
        !result.segments?.length ||
        result.segments.some(
          (s) => (s.no_speech_prob ?? 1) > 0.6 || (s.avg_logprob ?? -10) < -1,
        );
      return response({ text, review });
    }
    let payload: unknown = p;
    if (p.action === "rotate")
      payload = { action: "rotate", tokenHash: hash(p.token) };
    if (p.action === "mutate" && p.mutation.kind === "create") {
      const n = p.mutation.note;
      if (
        n.screenshot ||
        n.captureScope ||
        n.deletedAt ||
        n.updatedAt ||
        (n.context && Object.keys(n.context).some((k) => k !== "hrEventId"))
      )
        throw new Error("INVALID");
      if (n.source === "hr-checkin" && n.context?.hrEventId !== `hr-${n.t}`)
        throw new Error("INVALID");
      if (
        (n.activationAt ?? n.t) > (n.recordingStartedAt ?? n.t) ||
        (n.recordingStartedAt ?? n.t) > Date.now() + 300000
      )
        throw new Error("INVALID");
    }
    const { data, error } = await db.rpc("pulse_extension_action", {
      p_token_hash: hash(token),
      p_instance: instance,
      p_action: payload,
    });
    if (error) throw new Error(error.message);
    return response(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/unauthorized/i.test(message))
      return response(
        { error: "Connection expired or revoked. Reconnect Trade Pulse." },
        401,
      );
    if (/session deleted|session not found|note not found/.test(message))
      return response(
        {
          error:
            "The destination or note was deleted. Review this pending reflection.",
        },
        410,
      );
    if (/conflict/.test(message))
      return response(
        { error: "This note changed. Refresh and review before retrying." },
        409,
      );
    if (/RATE_LIMIT/.test(message))
      return response(
        { error: "Too many requests. Retry in one minute." },
        429,
      );
    if (/TOO_LARGE/.test(message))
      return response({ error: "Recording exceeds the 3 MB limit." }, 413);
    if (/DATABASE|NOT_CONFIGURED/.test(message))
      return response(
        {
          error:
            "Journal service unavailable. Pending notes remain on your device.",
        },
        503,
      );
    return response({ error: "Invalid journal request." }, 400);
  }
}

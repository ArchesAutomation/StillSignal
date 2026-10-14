// Run on an always-on service, never inside a Vercel request handler.
import { service } from "../src/lib/server";
import { runBrokerJob, runBrokerDiscovery } from "../src/lib/brokers/worker";
if (
  process.env.APP_ENV !== "staging" &&
  process.env.ALLOW_PRODUCTION_BROKER_WORKER !== "true"
)
  throw new Error(
    "Set APP_ENV=staging; production workers require an explicit release flag.",
  );
if (process.env.APP_ENV === "staging") {
  const ref = process.env.BROKER_STAGING_PROJECT_REF;
  if (
    !ref ||
    ref === "ipfurgwqqjkybhadzutj" ||
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname !==
      ref + ".supabase.co"
  )
    throw new Error(
      "The staging worker requires an explicitly isolated Supabase project reference.",
    );
}
const db = service();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
while (!stopping) {
  try {
    const discovered = await runBrokerDiscovery(db),
      synced = await runBrokerJob(db);
    if (!discovered && !synced)
      await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch {
    // Log only an operational code. Provider payloads, credentials, and account details stay private.
    console.error("BROKER_WORKER_DATABASE_UNAVAILABLE");
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

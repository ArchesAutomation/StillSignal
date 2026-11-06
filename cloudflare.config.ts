import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "eeaf93488e62f308917b45b18308abfd",
  worker: defineWorker({
    name: "still-signal",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-06",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    workersDev: true,
    observability: { enabled: true, redactQueryString: true, logs: { enabled: true, invocationLogs: true }, traces: { enabled: true, headSamplingRate: 0.1 } },
    env: {
      ASSETS: bindings.assets(),
      AI: bindings.ai(),
      NEXT_PUBLIC_SUPABASE_URL: bindings.text(process.env.NEXT_PUBLIC_SUPABASE_URL || ""),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: bindings.text(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""),
      APP_ORIGIN: bindings.text("https://still-signal.archesautomation.workers.dev"),
    },
  }),
});

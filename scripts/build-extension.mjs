import { build } from "esbuild";
import { mkdir, cp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const origin = new URL(
  process.env.EXTENSION_APP_ORIGIN || "https://trade-pulse-ebon.vercel.app",
).origin;
if (!origin.startsWith("https://") && origin !== "http://localhost:3000")
  throw new Error("Use HTTPS or the local development origin.");
const out = path.resolve("extension/dist");
if (path.dirname(out) !== path.resolve("extension"))
  throw new Error("Invalid extension build directory.");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp("extension/static", out, { recursive: true });
const config = {
  APP_ORIGIN: origin,
  WAKE_CONFIG: { available: false, accessKey: "", keyword: "Hey Journal" },
};
// Models and licensing are provisioned before building; no remote executable code.
if (
  process.env.PICOVOICE_ACCESS_KEY &&
  process.env.PICOVOICE_LICENSE_CONFIRMED === "true"
) {
  await mkdir(out + "/wake", { recursive: true });
  await cp(process.env.HEY_JOURNAL_MODEL_PATH, out + "/wake/hey-journal.ppn");
  await cp(
    process.env.PORCUPINE_PARAMS_PATH,
    out + "/wake/porcupine_params.pv",
  );
  config.WAKE_CONFIG = {
    available: true,
    accessKey: process.env.PICOVOICE_ACCESS_KEY,
    keyword: "Hey Journal",
  };
}
await build({
  entryPoints: [
    "extension/src/worker.ts",
    "extension/src/offscreen.ts",
    "extension/src/panel.ts",
    "extension/src/setup.ts",
  ],
  bundle: true,
  outdir: out,
  format: "esm",
  target: "chrome120",
  minify: true,
  plugins: [
    {
      name: "config",
      setup(b) {
        b.onLoad({ filter: /extension[\\/]src[\\/]config\.ts$/ }, () => ({
          contents:
            "export const APP_ORIGIN=" +
            JSON.stringify(config.APP_ORIGIN) +
            ";export const WAKE_CONFIG=" +
            JSON.stringify(config.WAKE_CONFIG) +
            ";",
          loader: "ts",
        }));
      },
    },
  ],
});
const manifest = {
  manifest_version: 3,
  name: "Trade Pulse Voice Journal",
  version: "0.1.0",
  minimum_chrome_version: "120",
  description:
    "Timestamped private trading reflections from a persistent side panel.",
  permissions: ["sidePanel", "storage", "offscreen", "alarms"],
  host_permissions: [origin + "/*"],
  background: { service_worker: "worker.js", type: "module" },
  action: {
    default_title: "Open Trade Pulse journal",
    default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" },
  },
  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  side_panel: { default_path: "panel.html" },
  options_page: "setup.html",
  commands: {
    "toggle-recording": {
      suggested_key: { default: "Ctrl+Shift+8", mac: "Command+Shift+8" },
      global: true,
      description: "Start or stop a journal reflection",
    },
  },
  externally_connectable: { matches: [origin + "/*"] },
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
};
await writeFile(
  out + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  out + "/BUILD-INFO.json",
  JSON.stringify(
    { origin, wakeAvailable: config.WAKE_CONFIG.available, chromeMinimum: 120 },
    null,
    2,
  ) + "\n",
);
console.log("Installable unpacked extension: " + out);

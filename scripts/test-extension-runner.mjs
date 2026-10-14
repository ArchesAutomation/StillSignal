import { spawnSync } from "node:child_process";
const original = { ...process.env };
const env = {
  ...original,
  EXTENSION_APP_ORIGIN: "http://localhost:3000",
  PICOVOICE_LICENSE_CONFIRMED: "false",
};
let code = 0;
try {
  for (const args of [
    ["scripts/build-extension.mjs"],
    ["--import", "tsx", "scripts/test-extension-chrome.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.status !== 0) {
      code = result.status ?? 1;
      break;
    }
  }
} finally {
  const result = spawnSync(process.execPath, ["scripts/build-extension.mjs"], {
    env: original,
    stdio: "inherit",
  });
  if (result.status !== 0) code = result.status ?? 1;
}
process.exitCode = code;

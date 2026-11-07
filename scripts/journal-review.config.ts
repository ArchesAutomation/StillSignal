// Synthetic UI review only. The production Vite config and Worker are unchanged.
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [vinext()],
  define: {
    "process.env.APP_ENV": JSON.stringify("staging"),
    "process.env.TRADERPULSE_UI_REVIEW": JSON.stringify("true"),
  },
});

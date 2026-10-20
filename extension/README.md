# Still Signal Voice Journal for Chrome

The extension is built into `extension/dist` with `node scripts/build-extension.mjs`. The production package is also downloadable from **Settings → Voice journal extension** in Still Signal. It is a Manifest V3 extension for Chrome 120 or newer.

1. Download `trade-pulse-voice-extension.zip` from Still Signal Settings and unzip it. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the unzipped folder containing `manifest.json`.
2. Open the extension from Chrome's toolbar. Click **Microphone setup**, then **Enable microphone**. If access is denied, use the link on that page to restore Chrome permission and check the operating system's microphone setting.
3. Click **Connect Still Signal**. Sign in to the application and approve the connection shown there. The single-use pairing code expires after two minutes. Pick a journal in the side panel, or create one there.
4. Click **Record a reflection** or press `Ctrl+Shift+8` (`Command+Shift+8` on macOS). Stop to transcribe and save. Chrome may decline or conflict with the suggested shortcut; the panel shows the effective assignment and links to `chrome://extensions/shortcuts` to change it.

The panel can close and tabs can change while recording. Finalized audio and pending notes remain on this device until transcription and account sync complete. Only activated speech is sent to a configured remote provider. A server-only Groq API key enables its free Whisper tier; an OpenAI key or Vercel AI Gateway is also supported. Raw audio is removed after transcription or cancellation. A revoked or changed account cannot upload another account's pending notes. Existing WHOOP recording still needs its application tab open and awake.

To activate the Groq option, create a key at `https://console.groq.com/keys` and save it as `GROQ_API_KEY` in the Still Signal Supabase project's **Edge Functions → Secrets**. Do not place the key in Chrome, the application's public environment variables, or source control. The deployed `pulse-extension` function uses the key immediately after the secret is saved.

The optional local “Hey Journal” engine requires a commercially licensed Picovoice AccessKey, a custom `Hey Journal` Porcupine `.ppn` model for web, and a matching `porcupine_params.pv` file. It is **disabled in the distributed build** because those assets and license have not been supplied. To build a licensed variant, set `PICOVOICE_LICENSE_CONFIRMED=true`, `PICOVOICE_ACCESS_KEY`, `HEY_JOURNAL_MODEL_PATH`, and `PORCUPINE_PARAMS_PATH` before running the build. The model and WASM code are bundled locally; wake listening requires explicit session consent and does not restart after a browser restart.

The source is in `extension/src`, the static panel and setup page in `extension/static`, and the application/backend pairing and journal actions are in `src/lib` and `supabase/functions/pulse-extension`. Production deployment does not publish the extension to the Chrome Web Store.

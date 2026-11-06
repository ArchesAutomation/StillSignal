# Still Signal on Cloudflare

## Release source
The application UI is PR60's Nordify release, based on `07ad2be3ed3c65ab567684231da0b175bfd40fa5`, with PR60's documentation from `c46a77a93298274b1e77d6f79c1ea4f370132611`. PR61's Plasma additions are excluded.

The root layout owns the global glass styles, with Nordify's integration overrides last, so client styles cannot load ahead of app rules that isolate the ocean backdrop. The glass library also declares the complete CSS layer order, including `legacy`. Declaring `legacy` later lets old positioning rules override the glass foreground and can blur panel text. Standard `backdrop-filter` declarations follow the WebKit fallback so production minification preserves Chromium's preset, nested-panel and reduced-transparency rules. `tests/glass-build.test.ts` checks both stylesheet entry orders and the actual root imports through the production Vite CSS pipeline.

## Hosting
Production Worker: `still-signal`, in Cloudflare account `eeaf93488e62f308917b45b18308abfd`.
New address: https://still-signal.archesautomation.workers.dev

Cloudflare Workers serves the application, static files and existing API routes. The vinext integration runs the existing Next.js application on the Workers runtime. `cloudflare.config.ts` is the deployment configuration; `vite.config.ts` configures the build.

The existing Supabase project still provides the database, user accounts, storage and Edge Functions. Those services were never hosted by Vercel and are not duplicated or migrated. The direct Supabase TradingView webhook stays the same.

## Automatic GitHub deployment
Cloudflare Builds should watch `main` for production:
- Build command: `npm run typecheck && env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY npm test && npm run build`
- Deploy command: `npm run deploy -- --skip-build`
- Preview command: `npx cf previews deploy`
- Node version: 24

Build variables:
- `NEXT_PUBLIC_SUPABASE_URL`: the existing production project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the existing public browser key
- `NODE_VERSION`: `24`
- `NEXT_TELEMETRY_DISABLED`: `1`

Cloudflare's Linux build runs unit tests without the live public Supabase settings so browser clients cannot start live auth refresh timers during tests. The values remain available for compilation and deployment.

The public Supabase values must be present at build time. Configuration copies them into Worker bindings for server routes too. Never put a Supabase service-role key in browser variables. No private Vercel environment variables existed in the inspected production configuration.

GitHub's Validate workflow checks compatibility, types, the Worker build and all tests. Cloudflare's build runs the same validation before deploying. A failed build must leave the last successful deployment live.

Caleb can make a branch, edit the UI and open a PR. After review and merging to main, Cloudflare deploys it. Preview builds use the configured backend; they are not separate databases. Use a dedicated Supabase staging project before testing destructive data changes.

## Voice journal
The Vercel AI Gateway/OIDC fallback has been removed. The existing Supabase/Groq or OpenAI transcription path remains first. If that authenticated, rate-limited backend reports that transcription is not configured, Workers AI Whisper runs through the `AI` binding. Transcripts remain review drafts; no confidence values are invented and inference does not save a journal entry.

The packaged Chrome extension targets the Cloudflare address. Existing installations need the new package and pairing at the new origin. The optional wake word remains disabled unless its licensed assets are supplied.

## Local development
Use Node 24. Copy `.env.example` to `.env.local`, set the two public Supabase values, then:
```sh
npm ci
npm run dev
npm run check
```

`npm run typecheck` generates Worker binding types before checking TypeScript. JSDOM component tests ignore CSS in both CommonJS and ESM; actual styling is verified in the browser.

## Cutover
Vercel's `*.vercel.app` hostnames belong to Vercel and cannot be transferred to Cloudflare. Users must sign in at the new address. Supabase-backed records remain in the same database. Browser preferences, cached recordings and unsent IndexedDB data belong to the old origin: sync or export any unsent records there before retiring it.

Update Supabase Auth's Site URL and exact redirect allowlist to the Cloudflare origin. Existing broker apps with registered callback URLs need the new `/api/brokers/callback` URL before enabling those integrations. The inspected Vercel production configuration did not enable broker or market service flags.

Verify the live login page, appearance controls, `/api/health`, unauthenticated API rejection, static files and the extension download before removing Vercel. Signed-in data operations and actual microphone/Bluetooth hardware checks require the account/device owner's session.

The migration does not transfer Vercel's historical deployment logs or build caches. Cloudflare starts its own deployment history and enables logs and sampled traces with query strings redacted.

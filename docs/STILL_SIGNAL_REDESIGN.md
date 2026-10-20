# Still Signal interface redesign

Implements the visual direction of `Still_Signal_Concept_v3.html` using the existing Next.js application and journal services.

## What changed

- Daily journal is the main workspace: week navigation, account/instrument/session filters, statistics, synchronized market and HR chart, replay, trade context, reflection history, and a free-form journal with rotating prompts.
- Overview shows actual session and reflection counts, the user's most recorded label, a monthly session calendar, and recent reflections.
- Patterns exposes the existing personal analytics and supporting moments in a dedicated view.
- Mindful trade review saves three editable sections as one ordinary journal reflection. Each section is limited to 600 characters to fit the existing 2,000-character storage contract.
- Stillness adds a pausable 60-second awareness practice and reflection themes. Its writing and voice actions use the existing reflection editor and selected session.
- The mobile drawer supports keyboard focus containment, Escape, and closing after navigation. Journal and review drafts remain mounted when navigating between views in the same session.
- The app, auth page, privacy page, floating journal, and downloadable voice extension use Still Signal branding. Manrope and DM Mono are self-hosted; licenses are included.

## Existing behavior retained

| Capability                                                                 | Location                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| Start/end session and optional WHOOP recording                             | Global session controls; Connections           |
| Broker account setup and history sync                                      | Connections                                    |
| TradingView alerts and token management                                    | Connections                                    |
| CSV mapping, preview, and import                                           | Global Import CSV; Connections; trade activity |
| Manual trade entries and paired exits                                      | Daily journal → Add event                      |
| Market/HR chart, instrument selection, replay, event context               | Daily journal                                  |
| Reflection labels, edits, deletion, dictation, screenshot upload/paste     | Daily journal; reflection editor               |
| Floating session dashboard and voice extension                             | Session dashboard; Settings                    |
| Historical sessions and account-scoped export/deletion                     | Sessions; Settings                             |
| Settings, personal sensitivity, check-ins, shortcuts                       | Settings                                       |
| Account authentication, local storage/outbox, cloud sync, tenant isolation | Existing services and storage contracts        |

No database migrations or production configuration changes are required. Existing IndexedDB names, preference keys, API routes, webhook identifiers, and download filenames retain their compatibility identifiers.

The verified Vercel project `still-signal` has both `still-signal.vercel.app` and `trade-pulse-ebon.vercel.app`. New extension packages use the Still Signal origin. Existing installed extensions can continue using the retained alias.

The concept's sample profits, R multiples, emotional predictions, AI-written summaries, points, streaks, and independent mindfulness storage are not simulated. Overview and Patterns show only available recorded evidence. Calendars group session start dates; they open a selected recording rather than silently merging multiple sessions into one record. Stillness reflections explicitly save into the selected journal.

## Verification

- TypeScript and optimized Next.js build pass.
- 105 automated tests pass, including recording across every navigation view, two-account storage isolation, cloud/API contracts, calendar leap dates and separate currencies, review payload limits and error recovery, the Stillness timer, and the existing today's-review deep link.
- Browser checks at 1536px and 390px cover all seven navigation views, signed-out screens, draft retention, reflection saves and edits, persisted IndexedDB writes, review updates without duplicate notes, pattern evidence, and mobile navigation. No uncaught browser exceptions or page overflow were observed.
- Installed Chrome extension checks pass using synthetic audio and a deterministic transcription provider. They cover pairing, offscreen recording through panel closure and worker termination, offline recovery, corrections, undo, microphone denial, restart consent, and revocation. This is not a live transcription-quality test.
- A normal optimized production build serves `/review` as 404. The review environment remains isolated from cloud accounts.
- Local developer console reports the existing CSP restriction on development-only React `eval`; production CSP was retained.

Live broker accounts, a physical wearable, real transcription services, and a deployed authenticated account were not exercised during this UI change. Production deployment and database/auth settings were not modified.

## Run the isolated preview

Install dependencies with `npm ci`. In PowerShell:

```powershell
$env:APP_ENV = 'staging'
$env:TRADERPULSE_UI_REVIEW = 'true'
$env:NEXT_PUBLIC_UI_REVIEW = 'true'
npm run dev
```

Leave public Supabase variables unset for this isolated review and open `http://localhost:3000/review`. Its labelled synthetic data comes from the existing staging fixtures. For ordinary development, use the existing environment setup instead.

# Still Signal: HTML concept implementation

The workspace now uses the supplied HTML's page structures and stylesheet. The original is preserved at design/Still_Signal_Concept_v3.html. The concept stylesheet contains its declaration values, scoped to the new workspace so existing dialogs retain their working styles. Manrope and both DM Mono weights are self-hosted.

## Screens and existing features

- Daily journal follows the concept's date controls, week strip, four metrics, Day story / Patterns / Review tabs, five trade phases, chronological rows, ruled writing area, prompt carousel, and reflection guide. Its chart now shows price candles over a synchronized heart-rate pane, with trade context beside it, following the later screenshot request.
- Overview follows the concept's opening question, metrics, evidence cards, monthly calendar, record summary, reflection panel, and review invitation. Counts and statements use the signed-in account's records.
- Heart-rate analytics uses the concept's visual insight, response-by-label bars, findings, time-block heatmap, and evidence panel. Supporting reflections open their original journal.
- Sessions uses the concept's recording list. Start/end session, optional WHOOP recording, CSV import, cloud refresh and opening an individual recording remain available.
- Stillness uses the concept's welcome screen, note card, Return to choice practice, topic pills, reflection bubble and quiet signal. The 60-second practice supports pause/resume/reset. Notes save into the selected journal.
- The floating pill opens session tools: manual trades, CSV, voice/screenshot capture, the existing floating journal, settings, account export and the full market/HR chart and replay.
- Connections and Settings open the existing operational controls in a workspace dialog. Broker accounts, TradingView, WHOOP, preferences, export/deletion, voice extension pairing and account sign-out retain their implementations.
- Reflection edits, deletion, labels, dictation and private screenshots use the existing editor and storage paths. Review sections update one ordinary reflection rather than creating duplicate reviews.
- Small screens use the concept's five-item bottom navigation; intermediate widths use its collapsed icon rail.

The existing account isolation, IndexedDB/outbox, cloud sync, API routes, extension credentials and compatibility identifiers are unchanged. No schema migration or environment change is included. Caleb's separate October 20, 2026 recording already contains clearly labeled fictional fills, reflections and 23,400 heart-rate samples. Its one-minute candles are generated deterministically from those fictional fills only for that specific session and account, labeled DEMO in the chart. Other sessions request their existing entitled market feed when an exact instrument is stored. Ordinary trade CSVs continue to add fills and chart markers with recorded heart rate; a fills-only file does not invent an OHLC price series.

## Verification

- 107 automated tests pass. The Bluetooth navigation test operates the new navigation and verifies samples continue across every view without disconnecting. Demo-candle tests cover fill alignment, deterministic bars and account isolation.
- scripts/test-concept-browser.cjs compares the original HTML and app at 1440px: header, hero, week strip, metrics, tabs and journal grid positions/widths match within 1px. The later screenshot changes the chart and trade-context card contents. Account content determines variable text heights and row counts.
- Browser checks cover synchronized candles/HR/trade context, an actual ordinary trade CSV upload, retained HR samples and visible entry/exit markers without made-up candles. They also cover inline draft retention, saving into chronological rows and IndexedDB, three-part reviews updating the same note, Stillness notes and practice controls, and access to WHOOP, settings, price/replay and trade-entry tools.
- All five primary screens fit 390px and 768px without page overflow; desktop views also fit. The browser run reports no page exceptions or application console errors. The pre-existing development-only React/CSP eval warning is excluded; production CSP remains intact.
- Price context waits until the synchronized chart's time and price scales have a visible layout before focusing its crosshair. This prevents the chart library's null-scale error when opening it in a dialog.

The concept's hard-coded prices, emotional predictions, AI summaries, R multiples, awareness points and streaks are not substituted for account data. The October 20 candles are explicitly fictional. AI organisation and independent mindfulness storage remain outside the existing shipped features. Calendar dates open individual recordings; recordings are not silently merged. A physical wearable, live broker and real transcription provider were not exercised by this UI verification.

## Run the isolated review

Install dependencies with npm ci. Set APP_ENV=staging, TRADERPULSE_UI_REVIEW=true and NEXT_PUBLIC_UI_REVIEW=true in the development server terminal, leaving public Supabase variables unset. Start npm run dev and open http://127.0.0.1:3000/review.

In another terminal run node scripts/test-concept-browser.cjs. It writes labeled fixture screenshots and a geometry/interaction report outside the repository under ../concept-verification. Use localhost for the development server to keep HMR on the allowed origin. The normal production build excludes the isolated /review route.

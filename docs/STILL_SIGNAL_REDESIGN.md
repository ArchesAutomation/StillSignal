# Still Signal — final V4 interface

`design/Still_Signal_Concept_v4.html` is the visual reference for Overview, Daily journal, Heart-rate analytics, Stillness and live capture. The stylesheet is mechanically scoped in `concept.css`; the final V4 declarations take precedence in `v4-reference.css`. `v4-functional.css` accommodates live data and retained controls. Fonts remain self-hosted.

The expandable Sessions/day/recording view, trade journeys, Connections, CSV import, Bluetooth recording, chart replay, screenshots and dictation remain available. Heart rate is the default journal chart. Price toggles the existing synchronized candle view. Additional session tools are in the header menu.

Stillness shows the reference's two cards, topic orbit, quiet reflection and post-session support. Its notes are private until explicitly linked. The in-app capture widget and floating journal share `CapturePanel`. The panel is 304px wide; the separate window requests 320×430 instead of 380×640. The pill supports dragging, and Escape closes the expanded panel.

This change also retains the interrupted V4 checklist work: journal destinations by trade/phase, optional event times distinct from creation time, drafts retained on the device, prompt answers saved independently from questions, private Stillness notes, post-session support, phase colors and a personal-history learning state for session load. Source-generated Edge Function validators carry those optional metadata fields. No database migration is required. The Edge Functions must be deployed with the frontend before releasing the new journal metadata to production; this branch does not change the live database or functions.

## Validation

- 112 automated tests pass, including Bluetooth navigation, CSV imports, floating-window editor retention, voice activation timestamps, cloud isolation, storage and reviews.
- TypeScript and an optimized webpack build pass.
- Browser checks at 1440px and 390px confirm no page overflow; Stillness uses two columns on desktop and one on mobile.
- Browser interactions verified nudge saving, private Stillness saving, journal saving, focus-mode Escape, analytics trade journeys and the preserved Sessions interface using synthetic, isolated data.
- The reference HTML was inspected as source. Its browser `file:` URL is unavailable to automation, so no pixel-diff claim is made.
- Real broker, wearable, microphone and cloud persistence were not exercised by the local UI review.

## Isolated UI review

Set `APP_ENV=staging` and `TRADERPULSE_UI_REVIEW=true`, with `NEXT_PUBLIC_SUPABASE_URL` empty. Build using `next build --webpack`, then run `next start --port 3021` and open `/review`. The optimized build avoids development eval code under the existing CSP. The normal production build excludes `/review`.

`scripts/test-concept-browser.cjs` is the historical V3 comparison and is not the V4 acceptance test.

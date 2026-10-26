# Still Signal v4 implementation — 26 October 2026

Implemented on production commit `4423af5369e44712322066c455083f88cffaa740` (`codex/fix-capture-layout`), preserving the working Stillness, Prepare, authentication, imports, wearable, and private-storage flows.

Reference: supplied Still_Signal.html; verified SHA-256 `5543f01f4fac73b66c6773c3612f3aa04d26d9aae392a8020e4a373930a2cb05`. The PDF controls scope; the HTML supplies the selected interactions.

## Delivered

1. Journal moments have direct label and writing fields with blur/Enter save, visible failure and retry, one canonical note across day/stage views, inline evidence expansion, thumbnail-first images and Undo removal. Label-added time is separate from capture time; original transcript/audio/frame timestamps survive corrections.
2. A 185 × 52 CSS pixel widget runs one shared recorder across the main page and floating window. Record freezes the already-shared surface and starts audio without label/stage questions. Stop retains audio, transcript status and frame, then saves automatically; confirmation is optional. Failures retain recovery assets, retries keep the original moment ID, and Undo handles misclicks. Existing optional quote adapters still work without delaying the microphone.
3. Chart history saves actual periodic frames with cadence/frame limits. Execution evidence shows the stored time and seconds before the fill; no generated replay or numeric quotes are inferred from screenshots. Pause marks an away interval in the same session; raw HR remains retained and away intervals are excluded from comparison.
4. One combined chart has BPM/currency axes, independently controlled HR/realised P&L/unrealised P&L/fills/moments, drag zoom, Reset zoom, and a wide view. Missing measurements stay missing.
5. Grouping has explanation, preview, explicit confirm, versioned Undo, merge and suggested-grouping preview. It partitions the selected fill and later fills without changing raw execution IDs or silently moving notes/images. Incomplete groups are flagged. Allocation and realised-P&L context stay scoped to each group.
6. Patterns recalculates across selected dates, shows date-scoped event counts, and filters location/setup/people/country/lifestyle/commitment context. Category answers distinguish Yes, explicit No and Unknown; interval changes and original capture context remain dated. Comparisons remain descriptive. Unavailable open-profit data shows a compact, labelled example and a connection action.
7. Weekly invitations are nonblocking, suppressed during active sessions/capture, deduplicated by owner/week/type, snoozable/dismissible and optional in Settings. Intentions retain their actual creation time and remain beside the later reflection.

## Verification

- TypeScript and optimized Next.js build passed.
- 167 automated tests passed, including capture/save retry identity, unlabelled audio retention, six-fill split/Undo, provenance round-trip, context Unknown/No separation, date-scoped counts and weekly timing.
- Browser acceptance in Edge: inline save/refresh/remove/Undo; chart toggles/drag/reset; original audio recorded with the browser MediaRecorder, played, and replayed after refresh; original chart frame retained and thumbnail bounded; label/text corrections preserve originals; pause/resume keeps the session; actual periodic frame storage; grouping preview/confirm/Undo; multi-date context filters/clear; reminder dismissal after refresh; desktop/mobile layouts with no horizontal overflow or page errors.
- Browser capture tests use the browser's synthetic microphone device and a generated test chart stream. Transcription callbacks are controlled test inputs, not a claim that a live transcription provider was tested.
- Existing Supabase save RPC preserved all new metadata in a transactional round-trip; the verification transaction was rolled back.

## Integration boundaries

- Original audio and automatic frames use the existing device-local private IndexedDB store. Audio has the existing seven-day retention; downloads remain available from the moment. JSON exports contain references, not audio/image bytes. This is shown in capture settings and evidence.
- Browser transcription runs when supported and allowed; unavailable/failed transcription never discards the original audio. No new paid transcription service is provisioned.
- Alt+J is supported with Still Signal or its floating window focused. It is not advertised as a global shortcut across unrelated chart applications. Existing extension ownership avoids double activation.
- Real wearable/broker services remain the existing integrations. No synthetic readings, quotes or P&L are seeded into user accounts. Open-profit results require timestamped nonzero positions and valid marks, not only a connection badge.
- Research modelling remains a separate track. Analysis export includes method version `still-signal-v4.1`, raw inputs, context and pause exclusions; recorded quality/cadence metadata is retained when supplied.

## Reproduce

Run the repository's `npm run check` (or equivalent direct Node commands). With an isolated staging build (`APP_ENV=staging`, `TRADERPULSE_UI_REVIEW=true`, and no cloud URL), run:

```
node scripts/test-implementation-plan.mjs
node scripts/test-plan-grouping-context.mjs
```

Set `UI_REVIEW_URL` to the local server origin when using a port other than 3100. The `/review` route remains disabled in production.

## Deployment status

The production `pulse-data` deployment requires approval. Automatic approval review rejected replacing that production function; the current remote function remains unchanged. The prepared function preserves its existing internal JWT checks and existing gateway setting.

The preview asks for the `still-signal-v4.1` save capability before uploading new metadata. Older backends cannot silently strip capture, grouping or context fields: full records stay local with a visible sync-paused state, and sync retries once the approved backend update is installed. The existing production frontend remains unchanged.

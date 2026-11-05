# Batch 8 — measured context and personal audio

5 November 2026. Fixed nearby-HR association across measurement pauses (including both sides of a pause), excluded artifact points, kept the ten-second nearest-observation bound, and made observed time/provider explicit. Existing line segmentation continues to leave discontinuities unbridged. This does not interpolate or infer emotion/readiness.

Fixed stale personal-audio playback when path/account changes, guarded duplicate microphone-permission requests, and stopped acquired tracks if recorder construction fails. Missing local assets report their absence rather than playing a previous message. Audio remains device-local; stillness remains optional and does not update feeling/readiness.

Validation: 287 tests pass, including three new pause/audio/permission regressions. Existing recorder tests simulate Bluetooth notifications, pause/resume, saved samples, stop/reopen and reset; existing tests cover timezone/DST, historical-day routing, source choices and HR gaps. The complete guided browser journey passes with simulated microphone recording and optional stillness, save/reopen, journaling/review and dark/light/mobile. Build and TypeScript pass. Patterns already exposes self-label/period/source filters and recorded moments; comparisons remain descriptive, not causal.

LIMIT: no physical wearable or physical microphone was operated. Browser media tests use synthetic input; they are not evidence of actual hardware pairing or acoustic playback quality. The inventory's real-hardware acceptance remains unverified. Production/account checks remain deferred. No schema/cloud deployment required.

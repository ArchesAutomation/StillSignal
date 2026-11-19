# Signed-in assistant pilot

Lets invited accounts use Ask Still Signal on the live site. It reuses the local prototype's panel, tools and Edge Function. The site route is always deployed, and **Supabase Edge Function secrets decide who can use it**. No Cloudflare variable or redeploy is needed to give access or turn the pilot off.

## How access is decided

1. The Cloudflare route `/api/assistant` is on in every deployment, set in `cloudflare.config.ts`. It holds no model key and makes no account decision. It refuses requests without a session token and forwards the rest.
2. The `pulse-assistant` Edge Function verifies the Supabase session on every request.
3. The function requires the secret `STILL_SIGNAL_ASSISTANT_PILOT=true` and the account's user ID in `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS`. Anyone else receives 404, and the panel never loads.
4. Each account is limited to 12 requests a minute through the existing `pulse_rate_limit` function.

## What leaves the app

Records are read in the browser from this device, for the dates asked about. The question and those results go through the Worker and Edge Function to OpenRouter. Nothing is stored by Still Signal and the tools are read-only.

Pilot requests set `data_collection: "deny"` and `zdr: true`, so OpenRouter may only use endpoints that meet those rules. If the model has no such endpoint, the assistant reports that and sends no records.

The configured model is `inclusionai/ling-3.2-flash:free`. OpenRouter lists its only endpoint, Ant Digital, as zero data retention. If that listing changes, requests fail and no records are sent.

Reads do not sync first. Days saved on another device and not yet downloaded may be missing, and the card says so.

Daily Journal, Done for the Day, sessions, trades and the Stillness library each have their own opt-in. See [assistant-journal-reads.md](assistant-journal-reads.md) and [assistant-screen-reads.md](assistant-screen-reads.md).

## Manage access (needs Caleb's approval)

Change these under Edge Function secrets in the Supabase dashboard. Each change applies on the next request, with no deployment.

| To do this | Set this secret |
| --- | --- |
| Give an account access | Add its Supabase user ID to `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS`, separated by commas |
| Remove one account | Remove its user ID from `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS` |
| Turn the pilot off for everyone | `STILL_SIGNAL_ASSISTANT_PILOT=false` |
| Turn the pilot back on | `STILL_SIGNAL_ASSISTANT_PILOT=true` |

An empty or missing allowlist means no account has access. An account without access receives 404. The panel does not appear on its next page load, and a panel that is already open fails on its next question.

## First-time setup

1. Confirm with a synthetic prompt that `ASSISTANT_MODEL` still accepts `provider: { data_collection: "deny", zdr: true, allow_fallbacks: false }`.
2. Set the Edge Function secrets `OPENROUTER_API_KEY`, `STILL_SIGNAL_ASSISTANT_PILOT=true` and `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS=<your Supabase user ID>`.
3. Signed in, ask "What's my preparation status?" and compare the card with Preparation. Confirm a second account sees no assistant.

## Check after a deployment

An anonymous `POST /api/assistant` should return 401, which shows the site route is on. A 404 means the route is off. This does not show whether an account has access, so also ask a question from an allowlisted account.

## Checks

```sh
node --import ./tests/browser-environment.mjs --import tsx --test tests/assistant-pilot.test.ts tests/assistant-prototype.test.ts tests/assistant-support-history.test.ts tests/assistant-dated-reads.test.ts
```

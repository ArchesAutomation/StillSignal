# Signed-in assistant pilot

Lets invited accounts use Ask Still Signal on the live site. It reuses the local prototype's panel, tools and Edge Function. **Merging this code enables nothing.** The pilot stays off until every step below is done.

## How access is decided

1. The Cloudflare route `/api/assistant` forwards requests only when `STILL_SIGNAL_ASSISTANT_PILOT=true` is set for the Worker.
2. The `pulse-assistant` Edge Function verifies the Supabase session on every request.
3. The function requires `STILL_SIGNAL_ASSISTANT_PILOT=true` and the account's user ID in `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS`. Anyone else receives 404, and the panel never loads.
4. Each account is limited to 12 requests a minute through the existing `pulse_rate_limit` function.

## What leaves the app

Records are read in the browser from this device, for the dates asked about. The question and those results go through the Worker and Edge Function to OpenRouter. Nothing is stored by Still Signal and the tools are read-only.

Pilot requests set `data_collection: "deny"` and `zdr: true`, so OpenRouter may only use endpoints that meet those rules. If the model has no such endpoint, the assistant reports that and sends no records.

The configured model is `inclusionai/ling-3.2-flash:free`. OpenRouter lists its only endpoint, Ant Digital, as zero data retention. If that listing changes, requests fail and no records are sent.

Reads do not sync first. Days saved on another device and not yet downloaded may be missing, and the card says so.

## Enable (needs Caleb's approval)

1. Confirm with a synthetic prompt that `ASSISTANT_MODEL` still accepts `provider: { data_collection: "deny", zdr: true, allow_fallbacks: false }`.
2. Set the Edge Function secrets `OPENROUTER_API_KEY`, `STILL_SIGNAL_ASSISTANT_PILOT=true` and `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS=<your Supabase user ID>`.
3. Deploy the function: `npx --yes supabase@2.122.1 functions deploy pulse-assistant --no-verify-jwt`.
4. Add the Cloudflare build variable `STILL_SIGNAL_ASSISTANT_PILOT=true` and rebuild main.
5. Signed in, ask "What's my preparation status?" and compare the card with Preparation. Confirm a second account sees no assistant.

## Turn off

Set the Edge Function secret `STILL_SIGNAL_ASSISTANT_PILOT=false`. This takes effect on the next request without a deployment. Then set the Cloudflare build variable to `false` and rebuild.

## Checks

```sh
node --import ./tests/browser-environment.mjs --import tsx --test tests/assistant-pilot.test.ts tests/assistant-prototype.test.ts tests/assistant-support-history.test.ts tests/assistant-dated-reads.test.ts
```

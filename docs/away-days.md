# Away days

A trader can mark a day deliberately spent away from live trading and write about it in **Daily journal → Day in Action**. The existing **Journal** book stays alongside it.

## How the data is kept

- Each change (marked date, reason, reflection, follow-up, reminder, book page) is one immutable row in `away_day_events`. Devices merge by replaying rows in time order, so offline edits never hit a revision conflict.
- Changes save to IndexedDB first and sync through `/api/process` and the `pulse-process` Edge Function.
- Screenshots stay on the device until a saved reflection refers to them. They then upload to the private `pulse-screenshots` bucket under `{user id}/away-days/`. A reflection syncs only after its screenshots are stored.
- Away days write nothing to `pulse_sessions` or `trading_days`. Starting a session remains a separate, explicit action.

## Release order

The feature is off until `NEXT_PUBLIC_STILL_SIGNAL_DAY_AWAY=true` is present when the app is built. The value is compiled into the browser code, so a Cloudflare runtime variable or a `cloudflare.config.ts` binding cannot turn it on. With the flag off, the app makes no away-day requests.

**Merging the code PR is expected to apply the production migration and deploy `pulse-process`.** The Supabase GitHub integration watches `main`. It applies new migrations, then deploys Edge Functions, shortly after each merge. Earlier merges redeployed every function within a minute. If the migration fails, Supabase skips the function deployment, and the current `pulse-process` keeps running. Cloudflare deploys the app either way, with the flag off.

Each step needs Caleb's approval before it starts.

1. **Merge the code PR.** Supabase applies `20261118230000_away_days.sql` and deploys `pulse-process`. Cloudflare deploys the app with Away Days still off.
2. **Verify the backend before enabling anything:**
   - The project's migration list includes `20261118230000_away_days`.
   - `public.away_day_events`, `public.pulse_away_append` and the storage policy `pulse_away_screenshot_upload` exist.
   - `pulse-process` shows an update time after the merge.
   - The Supabase security advisors report nothing new for these objects.
   - The `Production smoke` check passes on the merge commit.

   If any of these fail, stop. Leave Away Days off and investigate.
3. **Merge the flag PR.** It adds `.env.production` containing only `NEXT_PUBLIC_STILL_SIGNAL_DAY_AWAY=true`. Production builds read that file, so Cloudflare's normal rebuild of `main` turns the feature on. A build variable set in the Cloudflare dashboard would override the file.
4. **Run the hosted checks below.**

To turn it off, revert the flag PR. Cloudflare rebuilds without the flag. The table, the storage rule and the saved away days stay in the account. The migration is additive and is not rolled back.

## Hosted checks

**Persistence**, using one account on a desktop and a phone:

- Mark today away. Add a reason, a reflection with a screenshot and some Journal book words. Mark an earlier date and set a reminder.
- Reload the first device. On the second device, confirm everything appears, including the screenshot.
- On one device, write while offline, then reconnect. Confirm the change reaches the other device.
- Begin preparation on an ordinary day. Confirm the reminder appears, choose **Mark as seen**, and confirm it clears on both devices.
- Using read-only SQL, confirm the account's `pulse_sessions` and `trading_days` counts did not change, and that its `away_day_events` rows match what was written.

**Account isolation**, using a second test account:

- The second account sees no away days in the app.
- Using its own access token:
  - `GET /rest/v1/away_day_events?user_id=eq.<first account>` returns `[]`.
  - Fetching the first account's screenshot path from `pulse-screenshots` fails.
  - A direct `POST /rest/v1/away_day_events` is refused.
  - Uploading to `<first account>/away-days/` is refused.

## Verification

    node --import ./tests/browser-environment.mjs --import tsx --test tests/away-days.test.ts

The signed-in check needs a disposable local Supabase stack with this migration applied, on separate ports from any stack you use for development, and the app running against it with the flag on:

    $env:DAY_AWAY_SERVICE_KEY='<local secret key>'
    $env:DAY_AWAY_PUBLISHABLE_KEY='<local publishable key>'
    node scripts/verify-day-away-sync.mjs

The script refuses non-loopback URLs. It bypasses the browser security policy because that policy trusts only hosted `*.supabase.co` origins.

# Away days

A trader can mark a day deliberately spent away from live trading and write about it in **Daily journal → Day in Action**. The existing **Journal** book stays alongside it.

## How the data is kept

- Each change (marked date, reason, reflection, follow-up, reminder, book page) is one immutable row in `away_day_events`. Devices merge by replaying rows in time order, so offline edits never hit a revision conflict.
- Changes save to IndexedDB first and sync through `/api/process` and the `pulse-process` Edge Function.
- Screenshots stay on the device until a saved reflection refers to them. They then upload to the private `pulse-screenshots` bucket under `{user id}/away-days/`. A reflection syncs only after its screenshots are stored.
- Away days write nothing to `pulse_sessions` or `trading_days`. Starting a session remains a separate, explicit action.

## Release order

The feature is off until `NEXT_PUBLIC_STILL_SIGNAL_DAY_AWAY=true` is set at build time. With the flag off, the app makes no away-day requests, so merging the code cannot affect existing sync.

1. Merge the PR, then confirm migration `20261118230000_away_days.sql` is applied and `pulse-process` is deployed.
2. Add the Cloudflare build variable `NEXT_PUBLIC_STILL_SIGNAL_DAY_AWAY=true` and rebuild main.
3. Sign in on two devices and confirm a marked date, reason, reflection, screenshot and reminder appear on both.

To turn it off, remove the build variable and rebuild. Saved away days stay in the account.

## Verification

    node --import ./tests/browser-environment.mjs --import tsx --test tests/away-days.test.ts

The signed-in check needs a disposable local Supabase stack with this migration applied, on separate ports from any stack you use for development, and the app running against it with the flag on:

    $env:DAY_AWAY_SERVICE_KEY='<local secret key>'
    $env:DAY_AWAY_PUBLISHABLE_KEY='<local publishable key>'
    node scripts/verify-day-away-sync.mjs

The script refuses non-loopback URLs. It bypasses the browser security policy because that policy trusts only hosted `*.supabase.co` origins.

# Ask Still Signal: sessions, trades and Stillness

Extends the assistant beyond Preparation, support, Daily Journal and Done for the Day. **Merging this code gives no account access to these records.** Each kind of record stays off until a user ID is added to its own Edge Function secret.

| Records | Secret | Tools |
| --- | --- | --- |
| Daily Journal and Done for the Day | `STILL_SIGNAL_ASSISTANT_JOURNAL_USER_IDS` | `journal_entries`, `done_for_the_day` |
| Saved sessions and recorded trades | `STILL_SIGNAL_ASSISTANT_TRADES_USER_IDS` | `session_history` |
| Stillness library | `STILL_SIGNAL_ASSISTANT_STILLNESS_USER_IDS` | `stillness_practices` |

An account must already be in `STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS`. Tools for a list the account is not on are not offered, the browser refuses to read those records, and a request containing their results is rejected.

Journal fields are described in [assistant-journal-reads.md](assistant-journal-reads.md).

## Same records and calculations as the app

| Answer | Taken from |
| --- | --- |
| Recordings, reflections, orders and closed trades per day | `groupSessionDays`, as on Saved sessions |
| Realised P&L per day and period | `pnlByCurrency`, as on Saved sessions and the calendar |
| Individual trades | `sessionIdeas`, including manual grouping, splits and merges |
| Win rate and closed trades with recorded P&L | `ideaStats`, shared with the weekly review |
| Trade source | `eventOrigin`, as shown on trade activity |
| Practice search filters | `stillnessLibraryResults`, shared with the Stillness library |

Voided executions, alerts, strategy signals, backtests and demo sessions are excluded. Currencies are never added together. A closed trade with no recorded P&L is shown as not recorded and is left out of the win rate.

## New fields sent to OpenRouter

Results go through the Worker and Edge Function to OpenRouter with `data_collection: "deny"`, `zdr: true` and `allow_fallbacks: false`. Earlier results in a conversation are sent again with each follow-up.

### `session_history`

| Level | Fields |
| --- | --- |
| Period | Label, start and end dates, timezone, sync state, result, symbol asked about |
| Totals | Recordings, orders, closed trades, realised P&L by currency, closed trades with recorded P&L, win rate, largest gain and loss by currency with symbol and date |
| Day | Date, weekday, recordings, reflection count, orders, closed trades, realised P&L |
| Recording | Start time, end time, source type |
| Trade | Symbol, side, quantity, open or closed, entry and exit time, entry and exit price, recorded P&L, source label such as "CSV · Execution" |

One answer lists at most 60 trades, newest first. Totals still include every trade, and the answer says how many are not listed.

### `stillness_practices`

Only Still Signal's own library is sent: practice name, type, duration, focus, description, step titles and closing question. The search words the trader typed are part of the question. No personal record is read.

### Done for the Day links

`done_for_the_day` results gain a link for the card. It is removed before the model call, like every other link.

## Never sent

- Session IDs, note IDs, execution IDs, broker connection IDs and account IDs.
- Recording names, which can contain imported file names.
- Heart rate and heart-rate sample counts.
- Fees, instrument multipliers and raw fills that are not part of a trade.
- Audio, screenshots, chart captures and P&L snapshots.

## Links

Every card can open what it is based on, and opening never creates or changes a record.

| Card | Opens |
| --- | --- |
| Preparation | Preparation today, or that day's Journal for a past date |
| Support | Preparation today, or that day's Journal for a past date |
| Daily Journal | The Journal page or the highlighted note |
| Done for the Day | Done for the Day today, or that day's Journal for a past date |
| Sessions and trades | That recording's Journal, and Saved sessions |
| Stillness | The practice in the Stillness library |

A past date with no saved journal day shows a message instead of creating one.

## Not included

The assistant cannot edit records, add practices to a day, import files or control devices.

## Enable (needs Caleb's approval)

1. Merge in order: PR #103, then the Journal PR, then this PR. Confirm the Preparation pilot still works after each deployment.
2. In the Supabase dashboard, add your user ID to each secret you approve above.
3. Ask one question for each and compare the card with the screen it opened.

Clearing a secret turns that read off on the next request, with no deployment.

## Checks

```sh
node --import ./tests/browser-environment.mjs --import tsx --test tests/assistant-screen-reads.test.ts tests/assistant-journal-reads.test.ts
```

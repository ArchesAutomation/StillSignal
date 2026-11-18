# Ask Still Signal: Daily Journal and Done for the Day

Lets an invited pilot account ask about what it wrote and saved, for example "What did I write about rushing last week?" or "What did I record in Done yesterday?". **Merging this code gives no account access to journal records.** Access stays off until an account ID is added to the separate list described below.

## How access is decided

Everything in [assistant-pilot.md](assistant-pilot.md) still applies. Journal reads add one more server-side check:

1. The `pulse-assistant` Edge Function offers `journal_entries` and `done_for_the_day` only to user IDs in the secret `STILL_SIGNAL_ASSISTANT_JOURNAL_USER_IDS`. A missing or empty secret means nobody has them.
2. The function reports that decision to the browser. The browser refuses to read journal records unless it was told the account is listed.
3. A request from an unlisted account that contains a journal result is rejected with 400.

Other pilot accounts keep the existing assistant, with the same instructions and tools as before.

## What is read

Records are read in the browser from this device, for the dates asked about, and only for the signed-in account.

| Read | Source |
| --- | --- |
| Journal book page and silver lining | Passages joined back into one page |
| Day in Action notes | Note text, its stage, time, feeling label and any prompt question |
| Previous day writing | `blueprint.dailyWriting` |
| Done outcome and plan answers | `day.body.closeout`, as the labels shown on the Done screen |
| Practices added to Done | Title and kind |

## What is sent to OpenRouter

The question, the conversation so far and each tool result go through the Worker and Edge Function to OpenRouter. Earlier results in the same conversation are sent again with each follow-up. Requests set `data_collection: "deny"`, `zdr: true` and `allow_fallbacks: false`, so they fail rather than use an endpoint that retains data.

This is the tool result captured from a real synthetic request for "What did I write about rushing last week?":

```json
{
  "label": "Last week",
  "from": "2026-11-09",
  "to": "2026-11-15",
  "timezone": "Europe/London",
  "sync": "not-checked",
  "result": "found",
  "topic": "rushing",
  "days": [
    {
      "date": "2026-11-10",
      "weekday": "Tuesday",
      "entries": [
        {
          "kind": "Entry",
          "time": "12:01",
          "label": "Impatient",
          "question": null,
          "text": "I rushed the entry before the candle closed.",
          "clipped": false
        }
      ]
    }
  ],
  "omitted": 0
}
```

A Done result has the same period fields, then for each day `date`, `weekday`, `outcome`, `process`, `practices` and `writing`. Its `writing` holds the book page, silver lining and day-review notes for that day.

### How much journal text

| Question | Text sent |
| --- | --- |
| With a topic | Only entries that use the topic's words, as a passage of up to about 800 characters around the first match |
| Without a topic | Every entry for the period, up to 1,500 characters each |
| Done for the Day | That day's book page, silver lining and day-review notes, up to 1,500 characters each |
| A topic with no match | No journal text |

One answer sends at most 30 entries and 12,000 characters of journal text. The newest entries are kept, and the card and answer say how many were left out.

### Never sent

- Deleted notes, demo sessions and heart-rate check-in notes.
- Audio, screenshots, chart captures, quotes, capture environment details and original transcripts.
- Heart rate, baselines and any other measured context.
- Trades, executions, prices and P&L by these two tools. Trades have their own opt-in, described in [assistant-screen-reads.md](assistant-screen-reads.md). P&L snapshots are never sent.
- Session IDs and note IDs. The card uses them for its links, and the Edge Function removes them before calling the model.
- "What changed?" on the Done screen, because it is never saved.

Text the trader typed is sent as written. If a journal entry contains a name, account number or price, that text is included when the entry is read.

## Links back to entries

Each quoted entry has an **Open in Journal** button. A book page opens the Journal book on that day. A Day in Action note opens that day and highlights the note. Links only navigate, and they never create a day or change a record. Done for the Day has no screen for past dates, so its links go to that day's Journal.

## Limits

- Topic search matches the forms of the words asked about, such as rushing, rushed and rushes. It does not find related wording such as "hurried".
- Reads do not sync first, so days saved on another device and not yet downloaded may be missing.
- A period can cover at most 31 days. A topic with no period searches the last 31 days.

## Enable (needs Caleb's approval)

1. Merge PR #103 first, confirm the pilot still works, then merge this reviewed PR.
2. In the Supabase dashboard, add the Edge Function secret `STILL_SIGNAL_ASSISTANT_JOURNAL_USER_IDS=<your Supabase user ID>`.
3. Signed in, ask "What did I write about rushing last week?" and compare the card with the Journal.

## Turn off

Clear `STILL_SIGNAL_ASSISTANT_JOURNAL_USER_IDS` in the Supabase dashboard. This takes effect on the next request without a deployment.

## Checks

```sh
node --import ./tests/browser-environment.mjs --import tsx --test tests/assistant-journal-reads.test.ts
```

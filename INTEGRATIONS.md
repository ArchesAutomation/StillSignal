# Journal integrations

All integrations belong to the signed-in account. No wearable is required. A new account contains no invented data.

## CSV drop-off

Open **Connections → Trade CSV**. Drop one `.csv` file or choose it with the file picker. The browser parses it locally, validates all rows and shows a preview. The original file is not uploaded; only validated journal events are synchronized after you click Import.

Download the header-only template at `/trade-pulse-import-template.csv`:

```csv
timestamp,symbol,kind,side,price,quantity,pnl,execution_id
```

| Field | Format |
| --- | --- |
| `timestamp` | ISO 8601 with `Z` or an explicit offset, such as `2026-10-13T09:30:00Z`. Local `YYYY-MM-DD HH:mm:ss` is accepted only after selecting and confirming its IANA timezone. |
| `symbol` | Instrument, up to 32 characters. Supply a fixed instrument if the file omits this column. |
| `kind` | `entry` or `exit`. A fixed choice is available when the column is absent. |
| `side` | `long` or `short`. Buy/sell alone is insufficient to distinguish an entry from an exit. |
| `price` | Nonnegative finite decimal-point number. |
| `quantity` | Positive finite decimal-point number. |
| `pnl` | Optional USD monetary P&L on exits; entry P&L is omitted to avoid counting the same result twice. Percentage columns are rejected. Non-USD labeled columns must be converted or omitted. |
| `execution_id` | Optional stable broker/execution reference; recommended for distinguishing otherwise identical fills. |

Limits: 2 MB, up to 5,000 rows/events, unique headers. Quoted comma-grouped numbers are accepted. Invalid dates, ambiguous/nonexistent daylight-saving clock times, future times beyond five minutes, invalid monetary values and out-of-range event fields are rejected before saving. Errors identify the affected row. The template deliberately contains no sample trades.

### Native TradingView export

TradingView exports each Strategy Report tab separately. Export **List of Trades**, rather than Performance Summary. The importer detects English headers `Trade #`, `Type`, `Date/Time`, price and quantity, and monetary Net P&L/Net Profit. Select the instrument if it is absent and confirm the chart/export timezone. The combined Type field identifies entry/exit and long/short.

Strategy Report events are visibly labeled **Backtest**. They are simulated strategy results, not independently verified broker executions. Native exporter headers vary; use the mapping controls if an export is localized or has different labels. Broker execution reports detect common FillTime, Contract, B/S or Buy/Sell, Fill Qty, Fill Price, status, account and fill/execution ID headers. The importer requires confirmation of a complete export starting flat, excludes unfilled/cancelled orders, and reconstructs per-account entries, partial exits and reversals. Local timestamps still require an explicit timezone. Repeated cumulative order snapshots with conflicting IDs are rejected; identical distinct fills require unique fill IDs. Unrecognized layouts retain mapping controls. There is no universal broker CSV schema.

### Destination and retries

Create a new imported journal or add events to an existing journal whose time bounds include the file. A new journal spans the first to last imported event and has zero wearable samples. You can open it, replay it and add reflections.

Normalized trade content and execution references produce stable IDs. Identical rows in one file deduplicate. Reimporting the same event set as a new journal reuses its tenant-specific journal ID. P&L conflicts for existing imported executions are rejected in that path. Deduplication is scoped to that journal/event set; two overlapping but different files can create different journals. Use the current-journal destination when consolidating incremental exports. Journal edits and automatic reconciliation across distinct imports are outside this MVP.

## TradingView live alerts

1. Sign in, open **Connections → TradingView**, select the daily journal timezone and generate webhook setup.
2. Choose **Price / indicator alert** with explicit event, direction and quantity, or **Strategy order fills** for a strategy.
3. In TradingView, create the corresponding alert. Paste the supplied direct Supabase URL under **Notifications → Webhook URL** and the generated JSON under **Message**. Strategy setup requires an **Order fills** condition.
4. After the real alert fires, check its TradingView delivery log and this app's last-received time/event count. Journals refresh while signed in.

TradingView requires 2FA and webhook availability on the account's plan. It sends the configured alert as an HTTP POST, uses JSON content type for valid JSON, and cancels requests taking more than three seconds. This integration does not connect to TradingView account credentials, execute orders or discover every manual broker fill automatically.

The webhook URL is `https://ipfurgwqqjkybhadzutj.supabase.co/functions/v1/pulse-tradingview`. TradingView does not need an `apikey` or bearer header. The generated JSON carries a random ingestion-only token. It expires after 30 days; rotation or Disconnect immediately invalidates the old token. After reloading the page, generate a fresh key if you need to copy setup again. Never put broker passwords or account credentials in alert messages.

Alerts go to the latest owned open journal started within the preceding 12 hours. Otherwise, the server creates/reuses that account's calendar-day TradingView journal in the saved timezone. Calendar boundaries honor daylight saving. Daily journals keep their full-day bounds when a wearable recording ends, so later alerts can still arrive. Receipt is durable even while the app is closed. Legacy 24-hour session hooks remain compatible.

Price/indicator messages use supported `{{ticker}}`, `{{close}}` and UTC fire time `{{timenow}}` placeholders. The chosen event/direction/quantity are explicit user inputs. Strategy messages include order ID/action/contracts/price and previous/current position and size. The server distinguishes entries, partial exits, full exits and reversals; a reversal records an exit and an entry atomically. Alert and strategy provenance are displayed separately from CSV backtests. No P&L is inferred from strategy placeholders.

Identical event IDs/payloads deduplicate; changed data under the same ID is rejected. Limits: 8 KB request, 120 requests/minute per connection, 5,000 events per journal. Generated placeholder IDs distinguish ordinary fills but TradingView fire time has second precision. For several identical fills within one second, use a custom Pine message with a truly unique execution ID. Custom messages must conform to `webhookSchema` in `src/lib/validation.ts`.

## Optional wearable context

WHOOP Bluetooth can attach to the same journal. Sample data is optional everywhere. Apple Health, Oura and Garmin provider names are supported in the internal sample/connection model, but real authorization, ingestion and device connectors for those providers are future work.

## Provider documentation

- [TradingView webhook setup and delivery constraints](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/)
- [Strategy Report CSV exports](https://www.tradingview.com/support/solutions/43000613680-how-to-export-strategy-data/)
- [Supported alert placeholders](https://www.tradingview.com/support/solutions/43000531021-how-to-use-a-variable-value-in-alert/)
- [Pine strategy order-fill alerts](https://www.tradingview.com/pine-script-docs/concepts/alerts/)

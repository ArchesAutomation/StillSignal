"use client";
import { useMemo, useRef, useState, useDeferredValue } from "react";
import { Upload, Download, Check } from "lucide-react";
import {
  inspectCsv,
  parseTrades,
  csvFields,
  type CsvOptions,
  type CsvField,
} from "@/lib/csv";
import type { TradeEvent } from "@/lib/model";

export default function CsvImporter({
  onImport,
  hasSession,
  active,
  onDone,
}: {
  onImport: (
    events: TradeEvent[],
    name: string,
    destination: "new" | "current",
  ) => Promise<unknown>;
  hasSession: boolean;
  active: boolean;
  onDone?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [confirmedTimezone, setConfirmedTimezone] = useState(false),
    [destination, setDestination] = useState<"new" | "current">(
      active ? "current" : "new",
    );
  const [options, setOptions] = useState<CsvOptions>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const deferred = useDeferredValue(options);
  const inspection = useMemo(() => {
    try {
      return csv ? inspectCsv(csv) : null;
    } catch {
      return null;
    }
  }, [csv]);
  const preview = useMemo(() => {
    if (!csv) return { events: [] as TradeEvent[], error: "" };
    try {
      return { events: parseTrades(csv, deferred), error: "" };
    } catch (e) {
      return {
        events: [] as TradeEvent[],
        error: e instanceof Error ? e.message : "Check this CSV.",
      };
    }
  }, [csv, deferred]);
  const timezoneNeeded = !!inspection?.rows.some(
    (r) =>
      !/(Z|[+-]\d\d:\d\d)$/i.test(
        r[options.mapping?.timestamp || inspection.mapping.timestamp]?.trim() ||
          "",
      ),
  );
  async function read(file: File) {
    setError("");
    setConfirmedTimezone(false);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error("Choose a .csv file.");
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB.");
      const text = await file.text(),
        inspected = inspectCsv(text);
      setCsv(text);
      setName(file.name.replace(/\.csv$/i, ""));
      setOptions((o) => ({ ...o, mapping: inspected.mapping }));
    } catch (e) {
      setCsv("");
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  }
  function mapField(field: CsvField, value: string) {
    setOptions((o) => ({
      ...o,
      mapping: { ...inspection!.mapping, ...o.mapping, [field]: value },
    }));
    if (field === "timestamp") setConfirmedTimezone(false);
  }
  return (
    <section className="csv-importer" aria-label="Trade CSV importer">
      <div
        className={"csv-dropzone " + (dragging ? "dragging" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void read(f);
        }}
      >
        <Upload size={26} />
        <h3>Drop your trade CSV here</h3>
        <p>
          Or choose a file. Up to 2 MB and 5,000 events. No wearable required.
        </p>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Choose CSV file
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          aria-label="Trade CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = "";
          }}
        />
        <a
          className="text-button"
          href="/trade-pulse-import-template.csv"
          download
        >
          <Download size={14} />
          Download empty CSV template
        </a>
      </div>
      <p className="connection-note">
        Template columns: timestamp, symbol, kind, side, price, quantity, pnl,
        execution_id. ISO timestamps include Z or an offset. P&L is in USD. P&L
        and execution ID are optional; use a unique execution ID to distinguish
        otherwise identical fills.
      </p>
      {inspection && (
        <div className="csv-preview">
          <h3>{inspection.format}</h3>
          <p>
            {inspection.rows.length.toLocaleString()} rows · {name}
          </p>
          {inspection.backtest && (
            <p className="connection-note">
              Strategy Report exports are backtests, not broker executions.
              Imported events retain a Backtest label. Choose the List of Trades
              export, not Performance Summary or chart prices.
            </p>
          )}
          {inspection.fills && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!options.fillsStartFlat}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    fillsStartFlat: e.target.checked,
                  }))
                }
              />{" "}
              This export starts flat and includes every fill for each
              instrument and account.
              <small>
                Cancelled and unfilled orders are skipped. Use unique fill IDs
                for partial executions.
              </small>
            </label>
          )}
          <details>
            <summary>Review or change column mapping</summary>
            <div className="form-grid">
              {csvFields.map((field) => (
                <label key={field}>
                  {field.replaceAll("_", " ")}
                  <select
                    value={options.mapping?.[field] || ""}
                    onChange={(e) => mapField(field, e.target.value)}
                  >
                    <option value="">
                      {["pnl", "execution_id"].includes(field)
                        ? "Not included"
                        : "Use a fixed value below / choose column"}
                    </option>
                    {inspection.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
          <div className="form-grid">
            {!options.mapping?.symbol && (
              <label>
                Instrument for this file
                <input
                  value={options.symbol || ""}
                  maxLength={32}
                  placeholder="e.g. ES"
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, symbol: e.target.value }))
                  }
                />
              </label>
            )}
            {!options.mapping?.kind && !inspection.fills && (
              <label>
                Event type for every row
                <select
                  value={options.kind || ""}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      kind: e.target.value as CsvOptions["kind"],
                    }))
                  }
                >
                  <option value="">Choose explicitly</option>
                  <option value="entry">Entry</option>
                  <option value="exit">Exit</option>
                </select>
              </label>
            )}
            {!options.mapping?.side && !inspection.fills && (
              <label>
                Direction for every row
                <select
                  value={options.side || ""}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      side: e.target.value as CsvOptions["side"],
                    }))
                  }
                >
                  <option value="">Choose explicitly</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
            )}
            {timezoneNeeded && (
              <label>
                CSV timezone
                <input
                  list="csv-timezones"
                  value={options.timezone || ""}
                  onChange={(e) => {
                    setOptions((o) => ({ ...o, timezone: e.target.value }));
                    setConfirmedTimezone(false);
                  }}
                />
                <datalist id="csv-timezones">
                  {[
                    "UTC",
                    "America/New_York",
                    "America/Chicago",
                    "America/Denver",
                    "America/Los_Angeles",
                    "Europe/London",
                  ].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <small>
                  Match the timezone used in the exported file or TradingView
                  chart.
                </small>
              </label>
            )}
            <label>
              Import into
              <select
                value={destination}
                onChange={(e) =>
                  setDestination(e.target.value as "new" | "current")
                }
              >
                <option value="new" disabled={active}>
                  A journal for this file
                </option>
                {hasSession && (
                  <option value="current">The selected session</option>
                )}
              </select>
            </label>
          </div>
          {timezoneNeeded && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmedTimezone}
                onChange={(e) => setConfirmedTimezone(e.target.checked)}
              />
              I confirmed that the CSV timezone matches the export.
            </label>
          )}
          {preview.error ? (
            <p role="alert" className="banner error">
              {preview.error}
            </p>
          ) : (
            <>
              <p>
                <Check size={14} /> {preview.events.length.toLocaleString()}{" "}
                validated events. Preview times below are UTC.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Time (UTC)</th>
                      <th>Instrument</th>
                      <th>Event</th>
                      <th>Price</th>
                      <th>Qty</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.events.slice(0, 5).map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.t).toISOString()}</td>
                        <td>{e.symbol}</td>
                        <td>
                          {e.kind} {e.side}
                        </td>
                        <td>{e.price}</td>
                        <td>{e.quantity}</td>
                        <td>{e.pnl ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button
            className="button primary full"
            type="button"
            disabled={
              busy ||
              deferred !== options ||
              !!preview.error ||
              !preview.events.length ||
              (timezoneNeeded && !confirmedTimezone)
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onImport(preview.events, name, destination);
                setCsv("");
                onDone?.();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Import failed. Your file has not been discarded.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : `Import ${preview.events.length} events`}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="banner error">
          {error}
        </p>
      )}
    </section>
  );
}

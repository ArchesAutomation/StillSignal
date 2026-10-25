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
import type { CsvDestination } from "@/lib/csv-session";

export default function CsvImporter({
  onImport,
  hasSession,
  active,
  onDone,
}: {
  onImport: (
    events: TradeEvent[],
    name: string,
    destination: CsvDestination,
    timezone: string,
  ) => Promise<unknown>;
  hasSession: boolean;
  active: boolean;
  onDone?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const readGeneration = useRef(0);
  const [csv, setCsv] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [reading, setReading] = useState(false),
    [destination, setDestination] = useState<CsvDestination>("daily");
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
      // Preview the entry/exit reconstruction immediately. Saving still needs
      // the user's starting-position confirmation below.
      return { events: parseTrades(csv, { ...deferred, fillsStartFlat: true }), error: "" };
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
    const generation = ++readGeneration.current;
    setError("");
    setCsv("");
    setReading(true);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error("Choose a .csv file.");
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB.");
      const text = await file.text(),
        inspected = inspectCsv(text);
      if (readGeneration.current !== generation) return;
      setCsv(text);
      setName(file.name.replace(/\.csv$/i, ""));
      setDestination(inspected.backtest ? "new" : "daily");
      setOptions((o) => ({
        timezone: o.timezone,
        mapping: inspected.mapping,
      }));
    } catch (e) {
      if (readGeneration.current !== generation) return;
      setCsv("");
      setError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      if (readGeneration.current === generation) setReading(false);
    }
  }
  function mapField(field: CsvField, value: string) {
    setOptions((o) => ({
      ...o,
      mapping: { ...inspection!.mapping, ...o.mapping, [field]: value },
    }));
    setError("");
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
          if (busy) return;
          const f = e.dataTransfer.files[0];
          if (f) void read(f);
        }}
      >
        <Upload size={26} />
        <h3>{csv ? "Choose a different file" : "Drop your trade CSV here"}</h3>
        <p>
          Trades match your session by date and time. Your heart-rate recording stays intact.
        </p>
        <button
          className="button"
          type="button"
          disabled={busy || reading}
          onClick={() => input.current?.click()}
        >
          {reading ? "Reading file…" : "Choose CSV file"}
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
      {!csv && <p className="connection-note">
        TradingView: export filled Orders or History from the Trading Panel.
        No broker connection needed. Up to 2 MB and 5,000 events.
      </p>}
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
          {inspection.fills && inspection.orderUpdateColumn &&
            options.mapping?.timestamp === inspection.orderUpdateColumn && (
              <p className="connection-note" role="note">
                This export provides order Update Time, not a separate execution
                timestamp. Heart rate aligns to that update time, which may differ
                from the actual fill. P&amp;L stays blank if it is not in the file.
              </p>
            )}
          <details className="csv-advanced">
            <summary>Advanced import options</summary>
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
            <label>
              Import into
              <select value={destination} onChange={(e) => setDestination(e.target.value as CsvDestination)}>
                {!inspection.backtest && <option value="daily">Match sessions by trade date (recommended)</option>}
                <option value="new" disabled={active}>A separate journal for this file</option>
                {hasSession && <option value="current">The selected session only</option>}
              </select>
            </label>
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
                  aria-label="CSV timezone"
                  list="csv-timezones"
                  value={options.timezone || ""}
                  onChange={(e) => {
                    setOptions((o) => ({ ...o, timezone: e.target.value }));
                    setError("");
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
                  Use the timezone shown in your export. The import uses this to
                  align trades with your recorded heart rate.
                </small>
              </label>
            )}
          </div>
          {destination === "daily" && <p className="csv-match-summary" role="status">
            Trades will be added to the matching session for each date, alongside
            its recorded heart rate. If no session exists, a journal is created.
            Missing heart-rate measurements stay blank.
          </p>}
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
          {inspection.fills && !options.mapping?.kind && (
            <label className="checkbox-label csv-flat-confirmation">
              <input type="checkbox" checked={!!options.fillsStartFlat}
                onChange={(e) => setOptions((o) => ({ ...o, fillsStartFlat: e.target.checked }))} />
              <span>This export starts flat: no position was open before its first trade.
                <small>Include all fills for the period so entries and exits match correctly.</small>
              </span>
            </label>
          )}
          <button
            className="button primary full"
            type="button"
            disabled={
              busy || reading ||
              deferred !== options ||
              !!preview.error ||
              !preview.events.length ||
              (inspection.fills && !options.mapping?.kind && !options.fillsStartFlat)
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onImport(preview.events, name, destination, options.timezone || "UTC");
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

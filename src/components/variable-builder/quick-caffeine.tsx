"use client";
import { useState } from "react";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import { activeObservations, validateValue } from "@/lib/environment/values";
import { Field, type Context } from "../command-center/shared";
import { currentTimeOnDay, observationTimeInput, observationTime, earlierObservationTime } from "@/lib/environment/observation-time";
export default function QuickCaffeine({ store, day, props }: Context) {
  return <CaffeineEntry key={`${props.pulse?.owner ?? "local"}:${day.rootId}`} store={store} day={day} props={props} />;
}
function CaffeineEntry({ store, day, props }: Context) {
  const [dose, setDose] = useState("95"),
    [quantity, setQuantity] = useState("1"),
    [drink, setDrink] = useState("Coffee"),
    [at, setAt] = useState(
      () => currentTimeOnDay(day.body.date, day.body.timezone),
    ),
    [editing, setEditing] = useState<RecordOf<"observation">>(),
    [tracker, setTracker] = useState(""),
    [message, setMessage] = useState("");
  const definitions = latest(store.records, "variable").filter(
    (v) => !v.body.archived && /caffeine/i.test(v.body.name) &&
      v.body.unit.trim().toLowerCase() === "mg" &&
      ["number", "counter"].includes(v.body.type),
  );
  const otherCaffeine = latest(store.records, "variable").some(
    (v) => !v.body.archived && /caffeine/i.test(v.body.name),
  );
  const definition = editing ? store.records.find(
    (r): r is RecordOf<"variable"> => r.kind === "variable" && r.id === editing.body.definitionId,
  ) : definitions.find((d) => d.rootId === tracker) ||
    (!tracker && definitions.length === 1 ? definitions[0] : undefined);
  const observations = activeObservations(store.records).filter(
    (o) =>
      o.body.dayId === day.rootId &&
      store.records.some(
        (d) =>
          d.kind === "variable" &&
          d.id === o.body.definitionId &&
          /caffeine/i.test(d.body.name) &&
          d.body.unit.trim().toLowerCase() === "mg",
      ) &&
      o.body.missing === "recorded" &&
      typeof o.body.value === "number",
  );
  return (
    <section className="guide-caffeine">
      <h3>Quick caffeine entry</h3>
      <p>
        Use the label on your drink when available. These examples are
        estimates; brands and serving sizes vary.
      </p>
      <div className="cc-actions">
        {[
          ["Coffee · example 240 ml", 95],
          ["Monster · example 473 ml", 160],
          ["Pepsi · example 355 ml", 38],
          ["Custom / direct amount", 0],
        ].map(([label, mg]) => (
          <button
            type="button"
            key={label}
            onClick={() => {
              setDose(String(mg));
              setQuantity("1");
              setDrink(String(label));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage("");
          if (!definition && (editing || tracker)) {
            setMessage(editing
              ? "The original caffeine definition is unavailable. Refresh before correcting this entry; its definition has not been replaced."
              : "The selected caffeine tracker is no longer available. Choose a tracker again before saving.");
            return;
          }
          if (!definition && definitions.length > 1) {
            setMessage("Choose a caffeine tracker before saving this drink.");
            return;
          }
          if (!definition && otherCaffeine) {
            setMessage("Your caffeine variable uses another unit or value type. Record it in Personal variables, or create an mg tracker explicitly. No units or limits have been changed.");
            return;
          }
          let observedAt: number;
          try {
            observedAt = observationTime(at, day.body.timezone, editing?.body.observedAt);
          } catch (error) {
            setMessage((error as Error).message);
            return;
          }
          const value = Number(dose) * Number(quantity);
          if (
            !dose.trim() || !quantity.trim() ||
            !Number.isFinite(value) ||
            Number(dose) < 0 || Number(quantity) <= 0 ||
            !Number.isFinite(observedAt)
          ) {
            setMessage("Enter a valid amount and time.");
            return;
          }
          const d =
            definition ??
            createRecord("variable", {
              name: "Caffeine",
              category: "Personal conditions",
              type: "number",
              unit: "mg",
              choices: [],
              frequency: "event",
              phases: ["pre-market", "during", "post-session"],
              required: false,
              source: "manual",
              archived: false,
              analytics: true,
            });
          const observation = createRecord(
            "observation",
            {
              ...editing?.body,
              dayId: day.rootId,
              definitionId: d.id,
              value,
              observedAt,
              phase: editing?.body.phase ?? (day.body.status === "preparing" ? "pre-market" : "during"),
              missing: "recorded",
              source: "manual",
              provenance: `${drink}: ${quantity} serving(s), ${dose} mg each; user-entered / editable estimate`,
            },
            editing,
          );
          try {
            validateValue(d, observation.body);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Check the amount and configured range.");
            return;
          }
          if (await store.save([...(definition ? [] : [d]), observation])) {
            setTracker(d.rootId);
            setEditing(undefined);
            setMessage("Caffeine entry saved.");
          } else
            setMessage(
              "Could not save. Check the configured range below; your entry is still here.",
            );
        }}
      >
        {!editing && (definitions.length > 1 || (!!tracker && !definition)) && (
          <Field label="Caffeine tracker">
            <select value={definition?.rootId ?? ""} onChange={(e) => setTracker(e.target.value)}>
              <option value="">Choose a caffeine tracker…</option>
              {definitions.map((d) => <option key={d.id} value={d.rootId}>{d.body.name} · v{d.revision}</option>)}
            </select>
          </Field>
        )}
        {editing && definition && <p>Correcting {definition.body.name} · original definition v{definition.revision}. Its saved limits still apply.</p>}
        <div className="cc-grid">
          <Field label="Drink / serving description">
            <input
              maxLength={160}
              value={drink}
              onChange={(e) => setDrink(e.target.value)}
            />
          </Field>
          <Field label="Caffeine per serving (mg, editable)">
            <input
              type="number"
              min={0}
              step="any"
              required
              value={dose}
              onChange={(e) => setDose(e.target.value)}
            />
          </Field>
          <Field label="Number of servings">
            <input
              type="number"
              min={0.01}
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label={`When did you have it? (${day.body.timezone})`}>
            <input
              type="datetime-local"
              required
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="cc-actions">
          <button
            type="button"
            onClick={() => {
              try { setAt(earlierObservationTime(at, 15)); }
              catch { setMessage("Choose a valid time before adjusting it."); }
            }}
          >
            15 minutes earlier
          </button>
          <button type="button" onClick={() => setAt(currentTimeOnDay(day.body.date, day.body.timezone))}>
            Current time on selected day
          </button>
          <button type="submit" disabled={store.busy}>
            {editing ? "Save correction" : "Add caffeine entry"}
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(undefined)}>
              Cancel correction
            </button>
          )}
        </div>
        {definition && (
          <p>
            {definition.body.name} · configured range: {definition.body.min ?? "no minimum"} –{" "}
            {definition.body.max ?? "no maximum"} mg.{" "}
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.setItem(`ss-edit-variable:${props.pulse?.owner ?? "local"}`, definition.rootId); } catch {}
                props.onPage("Settings & Variables");
              }}
            >
              Inspect / edit variable definition
            </button>
          </p>
        )}
      </form>
      <p>
        {observations.length} entries ·{" "}
        {observations.reduce((n, o) => n + Number(o.body.value), 0)} mg recorded
        for {day.body.date} ({day.body.timezone})
      </p>
      {observations.map((o) => (
        <p key={o.id}>
          {o.body.value as number} mg ·{" "}
          {new Date(o.body.observedAt).toLocaleTimeString([], { timeZone: day.body.timezone })} ({day.body.timezone}){" "}
          <button
            type="button"
            onClick={() => {
              setEditing(o);
              setDose(String(o.body.value));
              setQuantity("1");
              setAt(observationTimeInput(o.body.observedAt, day.body.timezone));
              setDrink(o.body.provenance);
            }}
          >
            Correct amount / time
          </button>
        </p>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

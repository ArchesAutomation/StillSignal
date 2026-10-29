import type { BodyOf, ProcessRecord, RecordOf } from "../process/model.ts";
import { latest } from "../process/model.ts";
export function validateValue(definition: RecordOf<"variable">, observation: BodyOf<"observation">) {
  const d = definition.body, v = observation.value;
  if (observation.missing !== "recorded") { if (v !== null) throw new Error("Missing values must remain null."); return; }
  if (v === null) throw new Error("A recorded value is required.");
  if (["number", "scale", "duration", "counter"].includes(d.type)) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Enter a finite number.");
    if (d.min !== undefined && v < d.min || d.max !== undefined && v > d.max) throw new Error("Value is outside this definition's range.");
    if ((d.type === "duration" || d.type === "counter") && v < 0 || d.type === "counter" && !Number.isInteger(v)) throw new Error("Invalid duration or counter.");
  } else if (d.type === "boolean" && typeof v !== "boolean") throw new Error("Choose yes or no.");
  else if (d.type === "single-select" && (typeof v !== "string" || !d.choices.includes(v))) throw new Error("Choose a listed option.");
  else if (d.type === "multi-select" && (!Array.isArray(v) || v.some(x => !d.choices.includes(x)) || new Set(v).size !== v.length)) throw new Error("Choose distinct listed options.");
  else if (d.type === "timestamp" && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 8640000000000000)) throw new Error("Enter a valid timestamp.");
  else if (d.type === "text" && typeof v !== "string") throw new Error("Enter text.");
}
/** Returns pinned definition versions. Event doses are never silently summed into a daily value. */
export function observationsAt(records: ProcessRecord[], dayId: string, t: number, sessionId?: string, tradeId?: string) {
  const values = latest(records, "observation").filter(r => r.body.dayId === dayId && r.body.observedAt <= t && (!r.body.sessionId || r.body.sessionId === sessionId) && (!r.body.tradeId || r.body.tradeId === tradeId));
  const byVariable = new Map<string, { definition: RecordOf<"variable">; observation: RecordOf<"observation"> }>();
  for (const observation of values) {
    const definition = records.find((r): r is RecordOf<"variable"> => r.kind === "variable" && r.id === observation.body.definitionId);
    if (!definition) continue;
    const old = byVariable.get(definition.rootId);
    if (!old || observation.body.observedAt > old.observation.body.observedAt) byVariable.set(definition.rootId, { definition, observation });
  }
  return [...byVariable.values()];
}
export function displayValue(o: RecordOf<"observation">, d: RecordOf<"variable">) {
  if (o.body.missing !== "recorded") return o.body.missing.replaceAll("-", " ");
  const v = o.body.value;
  return d.body.type === "timestamp" ? new Date(v as number).toLocaleString() : (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? v ? "Yes" : "No" : String(v)) + (d.body.unit ? " " + d.body.unit : "");
}

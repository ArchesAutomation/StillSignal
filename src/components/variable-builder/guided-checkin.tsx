"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { temperatureRecords } from "@/lib/environment/temperature";
import { latest, type RecordOf } from "@/lib/process/model";
import { positionIdeas } from "@/lib/position-ideas";
import { useSavedGuide } from "../use-saved-guide";
import { Field, type Context } from "../command-center/shared";
const questions = ["Focus", "Energy", "Perceived stress", "Confidence in following my process", "Mental clarity"];
const schema = z.object({ page: z.number().int().min(0).max(30), answers: z.array(z.object({ question: z.string().max(160), value: z.number().min(1).max(10).nullable() })).max(30), physical: z.string().max(8000), circumstances: z.string().max(8000), reflection: z.string().max(8000), phase: z.enum(["pre-market", "during", "post-session"]), association: z.string() });
export default function GuidedCheckin({ context, previous, onClose }: { context: Context; previous?: RecordOf<"checkin">; onClose: () => void }) {
  const { store, props, day } = context;
  const draft = useSavedGuide(`ss-checkin-draft:${props.pulse?.owner ?? "local"}:${day.rootId}:${previous?.id ?? "new"}`, () => ({ page: 0, answers: previous?.body.answers ?? questions.map(question => ({ question, value: null })), physical: previous?.body.physical ?? "", circumstances: previous?.body.circumstances ?? "", reflection: previous?.body.reflection ?? "", phase: previous?.body.phase ?? (day.body.status === "preparing" ? "pre-market" as const : "during" as const), association: previous?.body.tradeId ?? "" }), v => schema.parse(v));
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { page, answers } = draft.value, question = answers[page];
  const positions = (props.history ?? []).filter(s => !s.demo).flatMap(s => positionIdeas(s.events).filter(i => i.openQuantity > 0).map(idea => ({ sessionId: s.id, idea })));
  useEffect(() => { heading.current?.focus(); }, [page]);
  async function save() {
    if (saving) return; setSaving(true); setError("");
    const linked = positions.find(p => p.idea.entryEventId === draft.value.association);
    try {
      const batch = temperatureRecords(store.records, { dayId: day.rootId, observedAt: previous?.body.observedAt ?? Date.now(), answers, physical: draft.value.physical, circumstances: draft.value.circumstances, reflection: draft.value.reflection, phase: draft.value.phase, sessionId: linked?.sessionId ?? previous?.body.sessionId, tradeId: linked?.idea.entryEventId ?? previous?.body.tradeId }, previous);
      if (await store.save(batch)) { draft.clear(); onClose(); } else setError("Your check-in could not be saved. Your answers are still here.");
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  if (!draft.loaded) return <p>Opening your check-in…</p>;
  return <section className="guide-checkin">
    <small>Check-in · {Math.min(page + 1, answers.length + 1)} of {answers.length + 1} · {day.body.date}</small>
    <h3 ref={heading} tabIndex={-1}>{question ? `How would you describe your ${question.question.toLowerCase()}?` : "Anything else you want to remember?"}</h3>
    {question ? <><div className="cc-rating-values" role="group" aria-label={question.question}>{Array.from({ length: 10 }, (_, i) => i + 1).map(value => <button key={value} type="button" aria-pressed={question.value === value} aria-label={`${question.question}: ${value} of 10`} onClick={() => draft.update(v => ({ ...v, answers: v.answers.map((a,n) => n === page ? { ...a, value: a.value === value ? null : value } : a) }))}>{value}</button>)}</div><p>1 · very low <span className="guide-scale-end">10 · very high</span></p><p>{question.value === null ? "Not recorded. You may leave this unanswered." : `${question.value}/10 · your own rating`}</p></> : <>{(["physical", "circumstances", "reflection"] as const).map(key => <Field key={key} label={{ physical: "Physical condition (optional)", circumstances: "Circumstances, caffeine or distractions (optional)", reflection: "What could this mean for my approach? (optional)" }[key]}><textarea maxLength={8000} value={draft.value[key]} onChange={e => draft.update(v => ({ ...v, [key]: e.target.value }))} /></Field>)}<details><summary>Timing & ongoing position (optional)</summary><Field label="When in your day?"><select value={draft.value.phase} onChange={e => draft.update(v => ({ ...v, phase: e.target.value as typeof v.phase }))}><option value="pre-market">Before my session</option><option value="during">During my session</option><option value="post-session">After my session</option></select></Field><Field label="Link to an existing open position"><select value={draft.value.association} onChange={e => draft.update(v => ({ ...v, association: e.target.value }))}><option value="">This trading day only</option>{positions.map(({ idea }) => <option key={idea.entryEventId} value={idea.entryEventId}>{idea.symbol} · opened {new Date(idea.entry).toLocaleDateString()}</option>)}</select></Field></details></>}
    {(error || draft.storageError) && <p role="alert">{error || draft.storageError}</p>}
    <div className="cc-actions"><button type="button" disabled={page === 0} onClick={() => draft.update(v => ({ ...v, page: v.page - 1 }))}>Back</button>{question ? <button className="cc-primary" type="button" onClick={() => draft.update(v => ({ ...v, page: v.page + 1 }))}>Continue check-in →</button> : <button className="cc-primary" type="button" disabled={saving || store.busy} onClick={() => void save()}>{saving ? "Saving…" : previous ? "Save check-in correction" : "Record check-in"}</button>}<button type="button" onClick={onClose}>Keep draft & close</button></div>
    <p className="cc-muted">Ratings are self-reported. Missing answers stay unrecorded. This check-in is shared with your preparation, journal and Command Center.</p>
  </section>;
}

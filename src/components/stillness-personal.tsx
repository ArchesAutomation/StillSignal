"use client";

import { useState } from "react";
import { z } from "zod";
import { catalogue } from "@/lib/stillness-catalogue";
import { defaultStillnessQuote, type StillnessItem } from "@/lib/stillness-practices";
import { useSavedGuide } from "./use-saved-guide";

export type GuidanceLanguage = "direct" | "spiritual";
const preferencesSchema = z.object({
  language: z.enum(["direct", "spiritual"]),
  quote: z.object({ text: z.string().trim().min(1), attribution: z.string() }),
  quoteVisible: z.boolean(),
});
const initialPreferences = () => ({ language: "spiritual" as GuidanceLanguage, quote: { ...defaultStillnessQuote }, quoteVisible: true });
export function useStillnessPreferences(owner: string) {
  return useSavedGuide(`ss-stillness-preferences:${owner}`, initialPreferences, value => preferencesSchema.parse(value));
}

const draftSchema = z.object({
  choice: z.object({ itemId: z.string(), piece: z.number().int().nonnegative().optional() }),
  step: z.number().int().nonnegative(),
  preview: z.boolean(),
}).refine(value => {
  const item = catalogue.find(item => item.id === value.choice.itemId && item.guidance);
  return !!item && (value.choice.piece === undefined || value.choice.piece < item.steps.length)
    && value.step < (value.choice.piece === undefined ? item.steps.length : 1);
});
export type StillnessDraft = z.infer<typeof draftSchema>;
export function useStillnessDraft(owner: string) {
  return useSavedGuide<StillnessDraft | null>(`ss-stillness-practice:${owner}`, () => null, value => draftSchema.nullable().parse(value));
}

export function LanguageChoice({ value, onChange, disabled }: {
  value: GuidanceLanguage; onChange: (value: GuidanceLanguage) => void; disabled?: boolean;
}) {
  return <label className="ss-guidance-language">Practice language{" "}
    <select value={value} disabled={disabled} onChange={event => onChange(event.target.value as GuidanceLanguage)}>
      <option value="direct">Direct</option>
      <option value="spiritual">With spiritual context</option>
    </select>
  </label>;
}

export function Understanding({ item }: { item: StillnessItem }) {
  if (!item.guidance) return null;
  return <details className="ss-understanding" key={item.id}>
    <summary>Understand this practice</summary>
    {item.guidance.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    <details>
      <summary>Inspiration and further reading</summary>
      <p>These teachers are among the inspirations for exploring presence and stillness. The exercises here were written for StillSignal.</p>
      <ul>{item.guidance.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
    </details>
  </details>;
}

export function StillnessPreferences({ preferences }: { preferences: ReturnType<typeof useStillnessPreferences> }) {
  const { value, update, loaded, storageError } = preferences;
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState(value.quote);
  return <div className="ss-stillness-personal">
    {value.quoteVisible && <figure className="ss-stillness-quote">
      <blockquote>{value.quote.text}</blockquote>
      {value.quote.attribution && <figcaption>{value.quote.attribution}</figcaption>}
      <button disabled={!loaded} onClick={() => { setQuote({ ...value.quote }); setEditing(true); }}>Edit quote</button>
    </figure>}
    <details className="ss-stillness-preferences">
      <summary>Stillness preferences</summary>
      <p>Saved for this account on this device. These preferences do not sync to other devices.</p>
      <LanguageChoice value={value.language} disabled={!loaded} onChange={language => update(previous => ({ ...previous, language }))} />
      <label><input type="checkbox" disabled={!loaded} checked={value.quoteVisible} onChange={event => update(previous => ({ ...previous, quoteVisible: event.target.checked }))} /> Show opening quote</label>
      <div className="ss-support-actions">
        <button disabled={!loaded} onClick={() => { setQuote({ ...value.quote }); setEditing(true); }}>Edit quote</button>
        <button disabled={!loaded} onClick={() => { update(previous => ({ ...previous, quote: { ...defaultStillnessQuote }, quoteVisible: true })); setEditing(false); }}>Restore default</button>
      </div>
    </details>
    {editing && <form className="ss-quote-editor" aria-label="Edit opening quote" onSubmit={event => {
      event.preventDefault();
      if (!quote.text.trim()) return;
      update(previous => ({ ...previous, quote: { text: quote.text.trim(), attribution: quote.attribution.trim() } }));
      setEditing(false);
    }}>
      <label>Quote<textarea autoFocus required value={quote.text} onChange={event => setQuote(previous => ({ ...previous, text: event.target.value }))} /></label>
      <label>Attribution (optional)<input value={quote.attribution} onChange={event => setQuote(previous => ({ ...previous, attribution: event.target.value }))} /></label>
      <div className="ss-support-actions">
        <button type="submit" disabled={!quote.text.trim()}>Save quote</button>
        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" onClick={() => { update(previous => ({ ...previous, quote: { ...defaultStillnessQuote }, quoteVisible: true })); setEditing(false); }}>Restore default</button>
      </div>
    </form>}
    {storageError && <p role="status">Your quote and preferences are available here, but could not be restored or saved on this device.</p>}
  </div>;
}

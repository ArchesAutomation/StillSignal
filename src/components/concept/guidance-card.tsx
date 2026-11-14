import type { Guidance } from "@/lib/adaptive-guidance";

// One optional suggestion, shown beside the answer that prompted it. Acting on it or not is the trader's choice.
export default function GuidanceCard({ guidance, disabled, note, onPractice, onReflect, onDismiss }: {
  guidance: Guidance;
  disabled?: boolean;
  note?: string;
  onPractice?: (itemId: string) => void;
  onReflect?: (question: string) => void;
  onDismiss: () => void;
}) {
  const { practice, reflect } = guidance;
  return (
    <aside className="rr-guidance" aria-label="Suggestion" data-guidance={guidance.key}>
      {guidance.because && <p className="rr-guidance-because">{guidance.because}</p>}
      <p className="rr-guidance-prompt">{guidance.prompt}</p>
      {reflect && reflect.question !== guidance.prompt && (
        <p className="rr-guidance-then">When you’re ready: “{reflect.question}”</p>
      )}
      {note && <p className="rr-guidance-note">{note}</p>}
      <div className="rr-guidance-actions">
        {practice && onPractice && <button disabled={disabled} onClick={() => onPractice(practice.itemId)}>
          {practice.label} <span aria-hidden="true">↗</span>
        </button>}
        {reflect && onReflect && <button disabled={disabled} onClick={() => onReflect(reflect.question)}>
          {reflect.label} <span aria-hidden="true">↗</span>
        </button>}
        <button className="ss-ghost" onClick={onDismiss}>Not now</button>
      </div>
    </aside>
  );
}

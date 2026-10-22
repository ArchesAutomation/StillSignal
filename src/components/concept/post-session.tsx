"use client";
import { useId, useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { supportResponse } from "@/lib/journal-routing";
import { useJournalDraft } from "../use-journal-draft";
import { cx } from "./shared";
export default function PostSession({ session, onSave }: { session: Session; onSave: (n: JournalEntry) => Promise<void> }) {
  const answerId = useId();
  const [outcome, setOutcome] = useState<"loss" | "profit" | "breakeven" | null>(null);
  const [adherence, setAdherence] = useState<"followed" | "broken" | "partly" | null>(null);
  const [answer, setAnswer] = useJournalDraft(`ss-support:${session.owner}:${session.id}`);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  return <section className={cx("outcomesupport")} aria-label="Post-session support">
    <div className={cx("outcomesupport-head")}><div><div className={cx("eyebrow")}>After the result</div>
      <h2>The outcome and your discipline are different questions.</h2>
      <p>A single trade can win or lose without proving that you traded well or badly. Begin with what you controlled: whether your model, risk and rules were followed.</p>
    </div><div className={cx("processmark")}>Process before verdict</div></div>
    <div className={cx("supportsteps")}>
      <div className={cx("supportstep")}><label>1 · What was the result?</label><div className={cx("supportchoices")} role="group" aria-label="Session result">
        {([["profit", "Profit"], ["loss", "Loss"], ["breakeven", "Breakeven"]] as const).map(([value, label]) => <button key={value} className={cx(outcome === value && "selected")} aria-pressed={outcome === value} onClick={() => setOutcome(value)}>{label}</button>)}
      </div></div>
      <div className={cx("supportstep")}><label>2 · How did you execute?</label><div className={cx("supportchoices", "process")} role="group" aria-label="Rule adherence">
        {([["followed", "I followed my rules"], ["partly", "I partly followed them"], ["broken", "I broke a rule"]] as const).map(([value, label]) => <button key={value} className={cx(adherence === value && "selected")} aria-pressed={adherence === value} onClick={() => setAdherence(value)}>{label}</button>)}
      </div></div>
    </div>
    <div className={cx("supportanswer")} hidden={!outcome || !adherence}>
      <div className={cx("supportlabel")}>{adherence === "followed" ? "Discipline recognised" : "Responsibility without judgement"}</div>
      <h3>{outcome === "loss" && adherence === "followed" ? "The trade lost. Your discipline did not." : "Keep the result and the process separate."}</h3>
      <p role="status">{outcome && adherence && supportResponse(outcome, adherence)}</p>
      <div className={cx("supportmantra")}>I am not here to prove that I am right. I am here to execute what I have tested.</div>
      <div className={cx("selfsupport")}><div><label htmlFor={answerId}>If another trader had followed the same process, what would you say to them?</label>
        <textarea id={answerId} aria-label="Post-session answer" value={answer} maxLength={2000} disabled={busy} onChange={e => setAnswer(e.target.value)} placeholder="Speak to yourself with honesty, without turning the result into an identity…" />
      </div><button className={cx("primary")} disabled={busy || !answer.trim() || !outcome || !adherence} onClick={async () => {
        if (!outcome || !adherence) return;
        setBusy(true); setStatus("Saving…");
        try {
          await onSave({ id: crypto.randomUUID(), t: Date.now(), eventTime: null, section: "post-session", label: "Unlabelled", text: answer, source: "typed", support: { outcome, adherence }, prompt: { id: "post-session-support", question: "What would you say to another trader who followed the same process?" } });
          setAnswer(""); setStatus("Saved to today's journal · Post-session support.");
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save. Your answer is still here."); }
        finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save reflection"}</button></div>
      {status && <p role="status">{status}</p>}
    </div>
  </section>;
}

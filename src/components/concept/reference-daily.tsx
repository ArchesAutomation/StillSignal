"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { useJournalDraft } from "../use-journal-draft";
import { cx } from "./shared";
import { journalDateValue } from "@/lib/journal-day";
export default function ReferenceDaily({
  session,
  onSave,
}: {
  session: Session;
  onSave: (p: Partial<SessionBlueprint>) => Promise<void>;
}) {
  const [draft, setDraft, ready] = useJournalDraft(
      `ss-daily:${session.owner}:${journalDateValue(session.startedAt)}`,
    ),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(0);
  const saved = session.blueprint?.dailyWriting || "";
  let value = saved;
  try {
    if (draft) value = JSON.parse(draft).text as string;
  } catch {}
  useEffect(() => {
    if (!ready || !draft) return;
    let text: string;
    try {
      text = JSON.parse(draft).text as string;
    } catch {
      return;
    }
    if (text === saved) {
      setDraft("");
      return;
    }
    const timer = setTimeout(() => {
      setStatus("Saving…");
      void onSave({ dailyWriting: text, dailyWritingUpdatedAt: Date.now() })
        .then(() => {
          setStatus("Saved to this day.");
        })
        .catch(() =>
          setStatus(
            "Could not save. Your draft is kept on this device. Retry below.",
          ),
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, ready, revision, saved]);
  return (
    <section className={cx("reference-card")}>
      <div className={cx("eyebrow")}>Space for the rest</div>
      <h2>Anything else about today?</h2>
      <p>A day-level journal. No stage or trade assignment.</p>
      <textarea
        aria-label="Daily free writing"
        maxLength={10000}
        disabled={!ready}
        value={value}
        onChange={(e) => {
          setDraft(JSON.stringify({ text: e.target.value }));
          setStatus("Unsaved changes · draft kept on this device");
        }}
      />
      <div className={cx("row-actions")}>
        <button onClick={() => setRevision((n) => n + 1)}>
          Save daily writing
        </button>
        <span role="status">{status || "Saved writing for this day"}</span>
      </div>
    </section>
  );
}

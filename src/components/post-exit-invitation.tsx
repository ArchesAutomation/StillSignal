"use client";
import { useEffect, useMemo, useState } from "react";
import { dateInZone } from "@/lib/process/model";
import {
  completedIdeas,
  reviewInvitationKey,
} from "@/lib/process/session-review";
import type { Props } from "./concept/shared";
import { GlassPanel } from "./glassyui/glass-panel";
export default function PostExitInvitation({ props }: { props: Props }) {
  const owner = props.pulse.owner,
    key = `ss-review-invitations:${owner}`;
  const [seen, setSeen] = useState<string[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
      setSeen(
        Array.isArray(saved) ? saved.filter((s) => typeof s === "string") : [],
      );
    } catch {
      setSeen([]);
    }
  }, [key]);
  const ideas = useMemo(
    () =>
      completedIdeas(
        [...props.history, props.session].filter((s) => s.owner === owner),
      ),
    [props.history, props.session, owner],
  );
  const pending = seen
    ? ideas.filter((i) => !seen.includes(reviewInvitationKey(i)))
    : [];
  function acknowledge() {
    const next = [
      ...new Set([...(seen ?? []), ...pending.map(reviewInvitationKey)]),
    ];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSeen(next);
      return true;
    } catch {
      setError(
        "This invitation could not be dismissed on this device. It may appear again after reopening.",
      );
      setSeen(next);
      return true;
    }
  }
  if (props.page === "Pre-Market") return null;
  if (!pending.length) return error ? <p role="status">{error}</p> : null;
  return (
    <GlassPanel
      lens
      className="guide-exit-invitation"
      role="status"
      aria-label="Post-exit review invitation"
    >
      <div>
        <span className="cc-eyebrow">A moment to review</span>
        <strong>
          {pending.length === 1
            ? "A trade has closed"
            : `${pending.length} completed trades are ready to review`}
        </strong>
      </div>
      <div className="cc-actions">
        <button
          className="cc-primary"
          onClick={() => {
            acknowledge();
            window.dispatchEvent(
              new CustomEvent("ss-review-day", {
                detail: dateInZone(
                  pending.at(-1)!.exit!,
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                ),
              }),
            );
            props.onPage("Trade Quality");
          }}
        >
          Review session →
        </button>
        <button onClick={() => acknowledge()}>Later</button>
        <button
          onClick={() => {
            acknowledge();
            props.onPage("Stillness");
          }}
        >
          Open my stillness
        </button>
      </div>
    </GlassPanel>
  );
}

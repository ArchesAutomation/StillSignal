"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { uploadScreenshot, removeScreenshot } from "@/lib/screenshots";
import { Screenshot } from "../reflection-editor";
import { cx } from "./shared";
export default function FinalReviewChart({
  session,
  ideaId,
  onSave,
  prepare,
}: {
  session: Session;
  ideaId: string;
  onSave: (p: Partial<SessionBlueprint>) => Promise<void>;
  prepare: (t: number) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const chart = session.blueprint?.finalCharts?.[ideaId];
  return (
    <details className={cx("final-review-chart")}>
      <summary>Final annotated chart · shared by this idea’s partials</summary>
      <p>
        This completed review chart is separate from each moment’s original
        capture.
      </p>
      {chart && <Screenshot {...chart} />}
      <label>
        {chart ? "Replace final chart" : "Add final chart"}
        <input
          aria-label={`Final chart for idea ${ideaId}`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            let uploaded:
              | Awaited<ReturnType<typeof uploadScreenshot>>
              | undefined;
            try {
              uploaded = await uploadScreenshot(
                file,
                session.owner,
                await prepare(session.startedAt),
              );
              await onSave({
                finalCharts: {
                  ...session.blueprint?.finalCharts,
                  [ideaId]: { ...uploaded, uploadedAt: Date.now() },
                },
              });
              if (chart) await removeScreenshot(chart.path).catch(() => {});
              setStatus("Final review chart saved.");
            } catch (err) {
              if (uploaded)
                await removeScreenshot(uploaded.path).catch(() => {});
              setStatus(
                err instanceof Error
                  ? err.message
                  : "Could not save the final chart.",
              );
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {chart && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const charts = { ...session.blueprint?.finalCharts };
              delete charts[ideaId];
              await onSave({ finalCharts: charts });
              await removeScreenshot(chart.path);
              setStatus(
                "Final chart removed. Original moment captures are kept.",
              );
            } catch (e) {
              setStatus(
                e instanceof Error ? e.message : "Could not remove the chart.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Remove final chart
        </button>
      )}
      <p role="status">{status}</p>
    </details>
  );
}

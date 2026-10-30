"use client";
import { useState } from "react";
import type { Settings } from "@/lib/model";
import { stageLabels, stages } from "@/lib/journal-reference";
export default function PhaseLabelPreferences({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <section className="glass settings-card">
      <h2>Your stage labels</h2>
      <p>
        One label per line. Changes affect suggestions; saved reflections keep
        their original words.
      </p>
      {stages.map((stage) => (
        <form
          key={stage}
          onSubmit={(e) => {
            e.preventDefault();
            const labels = [
              ...new Set(
                String(new FormData(e.currentTarget).get("labels") || "")
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ];
            if (labels.length > 30 || labels.some((v) => v.length > 40)) {
              setStatus("Use up to 30 labels, each 40 characters or fewer.");
              return;
            }
            try {
              onChange({
                ...settings,
                phaseLabels: { ...settings.phaseLabels, [stage]: labels },
              });
              setStatus(
                `${stage[0].toUpperCase() + stage.slice(1)} suggestions saved.`,
              );
            } catch {
              setStatus("Could not save label preferences on this device.");
            }
          }}
        >
          <label>
            {stage[0].toUpperCase() + stage.slice(1)}
            <textarea
              name="labels"
              aria-label={`${stage} label vocabulary`}
              defaultValue={(
                settings.phaseLabels?.[stage] ?? stageLabels[stage]
              ).join("\n")}
              maxLength={1230}
            />
          </label>
          <button className="button">Save {stage} labels</button>
        </form>
      ))}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={settings.smallPauses !== false}
          onChange={(e) =>
            onChange({ ...settings, smallPauses: e.target.checked })
          }
        />
        Offer optional pauses before reflection
      </label>
      <p role="status">{status}</p>
    </section>
  );
}

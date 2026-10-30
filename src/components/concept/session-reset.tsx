"use client";
import { useEffect, useState } from "react";
import { cx } from "./shared";
const modules = {
  "Box breathing": [
    "Inhale comfortably",
    "Hold gently",
    "Exhale slowly",
    "Rest gently",
  ],
  "Open awareness": [
    "Notice contact with the chair and floor.",
    "Notice a thought without solving it.",
    "Notice any urge to act.",
    "Allow the experience to be here.",
  ],
  "Body scan": [
    "Soften your face and jaw if that feels comfortable.",
    "Notice your shoulders and hands.",
    "Notice the movement of your chest.",
    "Feel your feet resting on the floor.",
  ],
  "Reset after loss": [
    "The session is finished. Feel your feet on the floor.",
    "Name one sensation without blame.",
    "A thought can be noticed without being followed.",
    "Nothing needs to be solved in this minute.",
  ],
};
export default function SessionReset({
  active,
  onChoice,
}: {
  active: boolean;
  onChoice: (choice: "voice" | "structured" | "journal") => void;
}) {
  const [module, setModule] = useState<keyof typeof modules>("Box breathing"),
    [preset, setPreset] = useState("4-4-4-4"),
    [duration, setDuration] = useState(64);
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running || !active) return;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(),
        delta = (now - previous) / 1000;
      previous = now;
      setElapsed((t) => Math.min(duration, t + delta));
    }, 100);
    return () => clearInterval(timer);
  }, [running, active, duration]);
  useEffect(() => {
    if (elapsed >= duration) setRunning(false);
  }, [elapsed, duration]);
  const lengths = preset.split("-").map(Number),
    cycle = lengths.reduce((n, x) => n + x, 0),
    inCycle = elapsed % cycle;
  let phase = 0,
    accum = lengths[0];
  while (inCycle >= accum && phase < 3) accum += lengths[++phase];
  const progress = (inCycle / cycle) * 100,
    complete = elapsed >= duration;
  const instruction = !elapsed
    ? "The session is finished. Nothing needs to be solved for the next minute."
    : complete
      ? "What is present before you explain why?"
      : module === "Box breathing"
        ? modules[module][phase]
        : modules[module][Math.min(3, Math.floor((elapsed / duration) * 4))];
  return (
    <section className={cx("reset")} aria-label="Post-session Stillness reset">
      <div className={cx("eyebrow")}>Arrive · breathe · observe · choose</div>
      <h1>A little space after the session.</h1>
      <p>{instruction}</p>
      <div className={cx("reset-modules")} aria-label="Stillness practice">
        {Object.keys(modules).map((m) => (
          <button
            className={cx(module === m ? "primary" : "ghost")}
            key={m}
            disabled={running}
            onClick={() => {
              setModule(m as keyof typeof modules);
              setElapsed(0);
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className={cx("breathing-square")}>
        <svg viewBox="0 0 200 200" aria-label="Breathing rim progress">
          <rect
            x="10"
            y="10"
            width="180"
            height="180"
            rx="12"
            pathLength="100"
            className="ss-breath-track"
          />
          <rect
            x="10"
            y="10"
            width="180"
            height="180"
            rx="12"
            pathLength="100"
            className="ss-breath-progress"
            strokeDasharray={`${progress} 100`}
          />
        </svg>
        <div>
          <strong>
            {complete
              ? "Observe"
              : module === "Box breathing" && elapsed
                ? ["Inhale", "Hold", "Exhale", "Rest"][phase]
                : "Arrive"}
          </strong>
          <span>{Math.ceil(duration - elapsed)} seconds</span>
        </div>
      </div>
      <div className={cx("reset-controls")}>
        <label>
          Practice length
          <select
            value={duration}
            disabled={running}
            onChange={(e) => {
              setDuration(+e.target.value);
              setElapsed(0);
            }}
          >
            <option value={64}>64 seconds</option>
            <option value={80}>80 seconds</option>
            <option value={120}>2 minutes</option>
          </select>
        </label>
        {module === "Box breathing" && (
          <label>
            Breathing rhythm
            <select
              value={preset}
              disabled={running}
              onChange={(e) => {
                setPreset(e.target.value);
                setElapsed(0);
              }}
            >
              <option value="4-4-4-4">4 in · 4 hold · 4 out · 4 rest</option>
              <option value="4-0-6-0">Gentle · 4 in · 6 out · no holds</option>
            </select>
          </label>
        )}
        <button
          className={cx("primary")}
          onClick={() => {
            if (complete) setElapsed(0);
            setRunning((v) => !v);
          }}
        >
          {running
            ? "Pause"
            : complete
              ? "Begin again"
              : elapsed
                ? "Resume"
                : "Begin reset"}
        </button>
      </div>
      <small>
        Breathe comfortably. Use the gentle rhythm or stop whenever you wish. No
        particular feeling is required.
      </small>
      <div className={cx("reset-choices")}>
        <h2>
          {complete
            ? "Choose what comes next"
            : "Your next step is always your choice"}
        </h2>
        <button className={cx("primary")} onClick={() => onChoice("voice")}>
          Speak freely
        </button>
        <button className={cx("ghost")} onClick={() => onChoice("structured")}>
          Start structured prompts
        </button>
        <button className={cx("ghost")} onClick={() => onChoice("journal")}>
          {complete ? "View session" : "Skip for this session · view journal"}
        </button>
      </div>
    </section>
  );
}

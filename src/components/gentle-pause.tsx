"use client";
import { useEffect, useState } from "react";
export default function GentlePause() {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const timer = setTimeout(
      () => setRemaining((n) => Math.max(0, (n ?? 0) - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [remaining]);
  return (
    <div className="ss-gentle-pause">
      <button
        type="button"
        className="ss-ghost"
        onClick={() => setRemaining(remaining && remaining > 0 ? null : 15)}
      >
        {remaining && remaining > 0
          ? "Skip pause"
          : "Take an optional 15-second pause"}
      </button>
      <span role="status">
        {remaining === null
          ? ""
          : remaining > 0
            ? remaining +
              " seconds · Notice contact with the floor. No answer is needed yet."
            : "When you are ready, continue in your own words."}
      </span>
    </div>
  );
}

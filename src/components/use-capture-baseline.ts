"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/model";
import { previousSessionBaseline } from "@/lib/capture-baseline";
import { isDemoSession } from "@/lib/demo-market";
import { getSamples } from "@/lib/storage";
import { cloudConfigured, pullSession } from "@/lib/cloud";

export function useCaptureBaseline(
  current: Session | null,
  history: Session[],
  seconds: number,
) {
  const candidates = history
    .filter(
      (s) =>
        current &&
        s.owner === current.owner &&
        s.id !== current.id &&
        !isDemoSession(s) &&
        s.endedAt &&
        s.endedAt <= current.startedAt &&
        s.sampleCount > 0,
    )
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10);
  const key = JSON.stringify([
    current?.id,
    current?.owner,
    current?.startedAt,
    seconds,
    candidates.map((s) => [s.id, s.sampleCount, s.blueprint?.updatedAt]),
  ]);
  const [result, setResult] = useState<{
    key: string;
    bpm: number | null;
    count: number;
  }>({ key: "", bpm: null, count: 0 });
  useEffect(() => {
    if (!current) return;
    let alive = true;
    void Promise.all(
      candidates.map(async (session) => {
        let samples = await getSamples(session.id, current.owner).catch(
          () => [],
        );
        if (
          samples.length < session.sampleCount &&
          cloudConfigured &&
          navigator.onLine
        ) {
          try {
            const remote = await pullSession(session.id);
            if (
              remote.session.id === session.id &&
              remote.session.owner === current.owner
            )
              samples = [
                ...new Map(
                  [...samples, ...remote.samples].map((p) => [p.t, p]),
                ).values(),
              ];
          } catch {
            /* A missing baseline is shown explicitly. */
          }
        }
        return { session, samples };
      }),
    ).then((groups) => {
      if (alive)
        setResult({
          key,
          ...previousSessionBaseline(groups, current, seconds),
        });
    });
    return () => {
      alive = false;
    };
    // This key covers every source and setting used by the calculation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result.key === key ? result : { bpm: null, count: 0 };
}

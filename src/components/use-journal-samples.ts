"use client";
import { useEffect, useMemo, useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { journalDaySessions } from "@/lib/journal-collection";
import { getSamples } from "@/lib/storage";
import { cloudConfigured, pullSession } from "@/lib/cloud";

/** Load sibling recordings without switching the selected day or leaking another owner's HR. */
export function useJournalSamples(current: Session, history: Session[], samples: Sample[]) {
  const siblings = journalDaySessions(current, history).filter(s => s.id !== current.id && s.sampleCount);
  const key = JSON.stringify([current.owner, current.id, siblings.map(s => [s.id, s.sampleCount])]);
  const [loaded, setLoaded] = useState<{ key: string; samples: Sample[] }>({ key: "", samples: [] });
  useEffect(() => {
    let alive = true;
    void Promise.all(siblings.map(async session => {
      let points: Sample[] = [];
      try { points = await getSamples(session.id, current.owner); } catch { /* Cloud fallback below. */ }
      if (points.length < session.sampleCount && cloudConfigured && navigator.onLine) {
        try {
          const remote = await pullSession(session.id);
          if (remote.session.id === session.id && remote.session.owner === current.owner) points = [...points, ...remote.samples];
        } catch { /* Missing measurements remain missing. */ }
      }
      return points;
    })).then(groups => { if (alive) setLoaded({ key, samples: groups.flat() }); });
    return () => { alive = false; };
    // The key includes the owner and every source ID/revision relevant to HR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => [...new Map([...(loaded.key === key ? loaded.samples : []), ...samples].map(p => [p.t, p])).values()].sort((a, b) => a.t - b.t), [key, loaded, samples]);
}

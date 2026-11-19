"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import Dashboard from "./dashboard";
import { saveSession, appendSamples } from "@/lib/storage";
import {
  reviewFixtures,
  reviewJournalSessions,
  reviewOwner,
  reviewPreparationRecords,
  reviewSupportHistoryRecords,
} from "@/lib/staging-fixtures";
import { dateInZone } from "@/lib/process/model";
import { readProcess, saveProcess } from "@/lib/process/storage";
// Loaded only when the local prototype is enabled.
const PreparationAssistant = lazy(() => import("./assistant/preparation-assistant"));
import { keepPrivateFile } from "@/lib/private-files";
import { sessionTrades } from "@/lib/journal-routing";
export default function StagingWorkspace({
  assistant = false,
  dayAwayReview = false,
}: {
  assistant?: boolean;
  dayAwayReview?: boolean;
}) {
  const [data] = useState(reviewFixtures);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      // Isolated fixtures only: demonstrate evidence without connecting a real account.
      const bars = data.candles.slice(0, 55),
        low = Math.min(...bars.map((b) => b.low)),
        high = Math.max(...bars.map((b) => b.high));
      const y = (v: number) => 180 - ((v - low) / (high - low)) * 135;
      const image = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220"><rect width="640" height="220" fill="#0b1112"/><text x="20" y="22" fill="#93a5a5" font-family="sans-serif" font-size="11">SIMULATED CHART CAPTURE · AAPL · 1m</text>${[60, 100, 140, 180].map((y) => `<path d="M20 ${y}H620" stroke="#293639"/>`).join("")}${bars
        .map((b, i) => {
          const x = 25 + i * 10.6,
            color = b.close >= b.open ? "#a8c6b2" : "#ee957d";
          return `<path d="M${x} ${y(b.high)}V${y(b.low)}" stroke="${color}"/><rect x="${x - 2.8}" y="${Math.min(y(b.open), y(b.close))}" width="5.6" height="${Math.max(1, Math.abs(y(b.open) - y(b.close)))}" fill="${color}"/>`;
        })
        .join(
          "",
        )}<path d="M50 164L480 72" stroke="#b6a3cb" stroke-dasharray="5 4"/><text x="20" y="208" fill="#93a5a5" font-family="sans-serif" font-size="10">Illustrative review evidence · no broker data</text></svg>`;
      const asset = await keepPrivateFile(
        reviewOwner,
        "journal-space-demo",
        "image",
        new Blob([image], { type: "image/svg+xml" }),
        data.session.id,
      );
      const trades = sessionTrades(data.session);
      data.session.journal = data.session.journal.map((note, i) => ({
        ...note,
        capturedAt: note.t,
        captureMode: i === 0 ? "live" : "post-session",
        eventTime: i === 0 ? note.t : data.session.startedAt + 43 * 60000,
        ...(i === 1
          ? { tradeId: trades[1]?.id, section: "management" as const }
          : {}),
        originalTranscript: note.text,
        transcriptStatus: "available",
        capture: {
          pressedAt: note.t,
          confirmedAt: note.t,
          imagePath: asset.path,
          imageCapturedAt: note.t,
        },
      }));
      await saveSession(data.session);
      await appendSamples(data.session.id, data.samples, reviewOwner, false);
      if (assistant) {
        // Local assistant prototype only: synthetic Preparation for today, never synced.
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const today = dateInZone(Date.now(), timezone);
        const existing = await readProcess(reviewOwner);
        const seed = reviewPreparationRecords(existing, today, timezone);
        const history = reviewSupportHistoryRecords([...existing, ...seed], today, timezone);
        if (seed.length || history.length)
          await saveProcess(reviewOwner, [...seed, ...history], false);
        for (const journal of reviewJournalSessions(today, timezone))
          await saveSession(journal);
      }
      if (active) setReady(true);
    })().catch(() => {
      if (active) setError("Review storage could not be initialized.");
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <div className="review-banner" role="status">
        ISOLATED UI REVIEW · Synthetic market, execution, and heart-rate data.
        No broker or wearable is connected.
      </div>
      {ready ? (
        <>
          <Dashboard
            initialSession={data.session}
            dayAwayReview={dayAwayReview}
            user={{ id: reviewOwner, email: "review@example.test" }}
          />
          {assistant && (
            <Suspense fallback={null}>
              <PreparationAssistant owner={reviewOwner} journal />
            </Suspense>
          )}
        </>
      ) : (
        <div className="loading">
          {error || "Preparing isolated review data…"}
        </div>
      )}
    </>
  );
}

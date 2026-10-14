"use client";
import { useEffect, useState } from "react";
import Dashboard from "./dashboard";
import { saveSession, appendSamples } from "@/lib/storage";
import { reviewFixtures, reviewOwner } from "@/lib/staging-fixtures";
export default function StagingWorkspace() {
  const [data] = useState(reviewFixtures);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      await saveSession(data.session);
      await appendSamples(data.session.id, data.samples, reviewOwner, false);
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
        <Dashboard
          initialSession={data.session}
          user={{ id: reviewOwner, email: "review@example.test" }}
        />
      ) : (
        <div className="loading">
          {error || "Preparing isolated review data…"}
        </div>
      )}
    </>
  );
}

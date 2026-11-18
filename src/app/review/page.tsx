import { notFound } from "next/navigation";
import StagingWorkspace from "@/components/staging-workspace";
import { assistantPrototypeEnabled } from "@/lib/assistant-prototype";
export default function Review() {
  // This review route is unavailable in production and cannot run against a cloud account.
  if (
    process.env.APP_ENV !== "staging" ||
    process.env.TRADERPULSE_UI_REVIEW !== "true" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return <StagingWorkspace
    assistant={assistantPrototypeEnabled()}
    dayAwayReview={process.env.STILL_SIGNAL_DAY_AWAY_REVIEW === "true"}
  />;
}

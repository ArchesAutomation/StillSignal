"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { authClient } from "@/lib/cloud";

// The panel and its chat libraries load only after the server confirms this account is invited.
const PreparationAssistant = lazy(() => import("./preparation-assistant"));

/** A current token for the account that owns this workspace, never another signed-in account's. */
export async function assistantPilotHeaders(owner: string, client = authClient()) {
  const session = (await client?.auth.getSession())?.data.session;
  if (!session?.access_token || session.user.id !== owner)
    throw new Error("Sign in again to use the assistant.");
  return { Authorization: `Bearer ${session.access_token}` };
}

/** Any failure means no access: the pilot stays invisible rather than showing an error. */
export async function assistantPilotAccess(owner: string, client = authClient()) {
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await assistantPilotHeaders(owner, client)) },
      body: JSON.stringify({ action: "access" }),
    });
    if (!response.ok) return false;
    return (await response.json()).enabled === true;
  } catch {
    return false;
  }
}

export default function AssistantPilot({ owner }: { owner: string }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    void assistantPilotAccess(owner).then((access) => {
      if (active) setAllowed(access);
    });
    return () => {
      active = false;
    };
  }, [owner]);
  if (!allowed) return null;
  return (
    <Suspense fallback={null}>
      <PreparationAssistant owner={owner} pilotHeaders={() => assistantPilotHeaders(owner)} />
    </Suspense>
  );
}

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
export async function assistantPilotCapabilities(owner: string, client = authClient()) {
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await assistantPilotHeaders(owner, client)) },
      body: JSON.stringify({ action: "access" }),
    });
    if (!response.ok) return { enabled: false, journal: false };
    const access = await response.json();
    return { enabled: access.enabled === true, journal: access.enabled === true && access.journal === true };
  } catch {
    return { enabled: false, journal: false };
  }
}

export async function assistantPilotAccess(owner: string, client = authClient()) {
  return (await assistantPilotCapabilities(owner, client)).enabled;
}

export default function AssistantPilot({ owner }: { owner: string }) {
  const [access, setAccess] = useState({ enabled: false, journal: false });
  useEffect(() => {
    let active = true;
    void assistantPilotCapabilities(owner).then((result) => {
      if (active) setAccess(result);
    });
    return () => {
      active = false;
    };
  }, [owner]);
  if (!access.enabled) return null;
  return (
    <Suspense fallback={null}>
      <PreparationAssistant owner={owner} journal={access.journal} pilotHeaders={() => assistantPilotHeaders(owner)} />
    </Suspense>
  );
}

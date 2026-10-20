import { z } from "zod";
export const pairingRequestSchema = z
  .object({
    extensionId: z.string().regex(/^[a-p]{32}$/),
    instanceId: z.uuid(),
    challenge: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Runtime = {
  sendMessage: (id: string, payload: unknown) => Promise<unknown>;
};
function runtime(): Runtime | undefined {
  return (window as unknown as { chrome?: { runtime?: Runtime } }).chrome
    ?.runtime;
}
export async function extensionMessage(
  id: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  if (!/^[a-p]{32}$/.test(id) || !runtime())
    throw new Error("Open Still Signal in Chrome with the extension installed.");
  const response = await runtime()!.sendMessage(id, payload);
  if (!response || typeof response !== "object")
    throw new Error("Extension unavailable. Open its panel and reconnect.");
  const value = response as Record<string, unknown>;
  if (value.error) throw new Error(String(value.error));
  return value;
}
export function connectedExtension(owner: string) {
  try {
    const id = localStorage.getItem("pulse-extension:" + owner);
    return id && /^[a-p]{32}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
let lease:
  | { owner: string; until: number; shortcut?: string; promptsPaused: boolean }
  | undefined;
export function updateExtensionLease(
  owner: string,
  result: Record<string, unknown>,
) {
  lease = result.connected
    ? {
        owner,
        until: Date.now() + 12000,
        shortcut:
          typeof result.shortcut === "string" ? result.shortcut : undefined,
        promptsPaused: result.promptsPaused === true,
      }
    : undefined;
}
export function extensionOwnsShortcut(owner: string, key: string) {
  return (
    !!lease &&
    lease.owner === owner &&
    lease.until > Date.now() &&
    lease.shortcut?.toLowerCase() === `alt+${key.toLowerCase()}`
  );
}
export async function routeExtensionPrompt(
  owner: string,
  sessionId: string,
  moment: { id: string; t: number },
) {
  const id = connectedExtension(owner);
  if (!id || !lease || lease.owner !== owner || lease.until < Date.now())
    return false;
  // Pausing from the extension also silences application announcements.
  if (lease.promptsPaused) return true;
  try {
    return (
      (
        await extensionMessage(id, {
          type: "hr-prompt",
          userId: owner,
          sessionId,
          momentId: moment.id,
          t: moment.t,
        })
      ).claimed === true
    );
  } catch {
    return false;
  }
}

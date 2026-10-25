import type { Session } from "./model";
import { mergeNotes } from "./smart-journal";
import { mergeEvents } from "./trade-context";
export type WorkspaceUser = { id: string; email?: string };
export function emptyWorkspace(owner: string): Session {
  return {
    id: "workspace",
    owner,
    name: "Your workspace",
    startedAt: Date.now(),
    source: "journal",
    events: [],
    journal: [],
    sampleCount: 0,
  };
}
export function mergeSessions(
  local: Session | undefined,
  remote: Session,
): Session {
  if (!local) return remote;
  if (local.owner !== remote.owner || local.id !== remote.id)
    throw new Error("Workspace identity mismatch.");
  return {
    ...remote,
    blueprint: (local.blueprint?.updatedAt || 0) > (remote.blueprint?.updatedAt || 0) ? local.blueprint : remote.blueprint || local.blueprint,
    sampleCount: Math.max(local.sampleCount, remote.sampleCount),
    endedAt: local.endedAt || remote.endedAt,
    events: mergeEvents(remote.events, local.events),
    journal: mergeNotes(remote.journal, local.journal),
  };
}

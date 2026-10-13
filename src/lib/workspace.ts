import type { Session } from "./model";
export type WorkspaceUser = { id: string; email?: string };
export function emptyWorkspace(owner: string): Session {
  return {
    id: "workspace",
    owner,
    name: "Your workspace",
    startedAt: Date.now(),
    source: "whoop",
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
    sampleCount: Math.max(local.sampleCount, remote.sampleCount),
    endedAt: local.endedAt || remote.endedAt,
    events: [
      ...new Map(
        [...remote.events, ...local.events].map((e) => [e.id, e]),
      ).values(),
    ].sort((a, b) => a.t - b.t),
    journal: [
      ...new Map(
        [...remote.journal, ...local.journal].map((j) => [j.id, j]),
      ).values(),
    ].sort((a, b) => a.t - b.t),
  };
}

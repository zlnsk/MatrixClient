/**
 * Typed wrappers around private/undocumented matrix-js-sdk APIs.
 *
 * All `as any` access to SDK internals is centralized here so that
 * an SDK upgrade only requires updating this single file.
 */
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk'

// ---- Event helpers ----

/** Get decrypted content for an event (Rust crypto path). */
export function getClearContent(event: MatrixEvent): Record<string, unknown> | null {
  return (event as unknown as { getClearContent?: () => Record<string, unknown> | null }).getClearContent?.() ?? null
}

/** Get event send status (pending, sending, encrypting, not_sent, etc.) */
export function getEventStatus(event: MatrixEvent): string | null {
  return (event as unknown as { status: string | null }).status
}

// ---- Room helpers ----

/** Get unread notification count for a room. */
export function getUnreadNotificationCount(room: Room, type: string = 'total'): number {
  return (room as unknown as { getUnreadNotificationCount: (type: string) => number }).getUnreadNotificationCount(type) || 0
}

/** Get/set custom reaction index attached to room (for O(1) reaction lookup). */
export function getReactionIndex(room: Room): Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>> | undefined {
  return (room as unknown as Record<string, unknown>).__reactionIndex as Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>> | undefined
}

export function setReactionIndex(room: Room, index: Map<string, Map<string, { count: number; users: string[]; includesMe: boolean }>>): void {
  (room as unknown as Record<string, unknown>).__reactionIndex = index
}

// ---- Client helpers ----

/** Get account data event content (e.g. m.direct). */
export function getAccountDataContent(client: MatrixClient, eventType: string): Record<string, unknown> {
  return (client as unknown as { getAccountData: (type: string) => { getContent: () => Record<string, unknown> } | null }).getAccountData(eventType)?.getContent() || {}
}

/** Set account data. */
export async function setAccountData(client: MatrixClient, eventType: string, content: Record<string, unknown>): Promise<void> {
  await (client as unknown as { setAccountData: (type: string, content: Record<string, unknown>) => Promise<void> }).setAccountData(eventType, content)
}

/** Send an event (message, reaction, etc.) to a room. */
export async function sendEvent(client: MatrixClient, roomId: string, eventType: string, content: Record<string, unknown>): Promise<unknown> {
  return (client as unknown as { sendEvent: (roomId: string, type: string, content: Record<string, unknown>) => Promise<unknown> }).sendEvent(roomId, eventType, content)
}

/** Send a state event to a room. */
export async function sendStateEvent(client: MatrixClient, roomId: string, eventType: string, content: Record<string, unknown>, stateKey: string = ''): Promise<unknown> {
  return (client as unknown as { sendStateEvent: (roomId: string, type: string, content: Record<string, unknown>, stateKey: string) => Promise<unknown> }).sendStateEvent(roomId, eventType, content, stateKey)
}

/** Search room events. */
export async function searchRoomEvents(client: MatrixClient, opts: { term: string }): Promise<{ results: Array<{ result: Record<string, unknown> }> }> {
  return (client as unknown as { searchRoomEvents: (opts: { term: string }) => Promise<{ results: Array<{ result: Record<string, unknown> }> }> }).searchRoomEvents(opts)
}

/** Clear TURN server polling interval (private SDK field). */
export function clearTurnServerPolling(client: MatrixClient): void {
  const c = client as unknown as Record<string, unknown>
  if (c.checkTurnServersIntervalID) {
    clearInterval(c.checkTurnServersIntervalID as ReturnType<typeof setInterval>)
    c.checkTurnServersIntervalID = undefined
  }
}

import { randomUUID } from 'node:crypto';
import type { PreparedCall } from './executor.js';

export interface PendingItem {
  prepared: PreparedCall;
  summary: Record<string, unknown>;
}

export interface PendingAction {
  id: string;
  sessionId: string;
  endpointId: string;
  method: string;
  path: string;
  items: PendingItem[];
  createdAt: number;
  expiresAt: number;
}

export const MAX_BATCH_ITEMS = 10;

const TTL_MS = 5 * 60_000;
const MAX_PENDING = 20;
const store = new Map<string, PendingAction>();

function evict(): void {
  const now = Date.now();
  for (const [id, action] of store) {
    if (action.expiresAt <= now) {
      store.delete(id);
    }
  }

  while (store.size >= MAX_PENDING) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function createPendingAction(input: {
  sessionId: string;
  items: PendingItem[];
}): PendingAction {
  evict();
  const first = input.items[0]?.prepared;
  if (!first) {
    throw new Error('Una acción pendiente necesita al menos un item.');
  }

  const now = Date.now();
  const action: PendingAction = {
    id: randomUUID(),
    sessionId: input.sessionId,
    endpointId: first.endpoint.id,
    method: first.method,
    path: first.endpoint.path,
    items: input.items,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  store.set(action.id, action);
  return action;
}

export function consumePendingAction(
  id: string,
  sessionId: string,
): PendingAction | null {
  const action = store.get(id);
  if (!action) return null;
  if (action.sessionId !== sessionId) return null;

  store.delete(id);

  if (action.expiresAt <= Date.now()) {
    return null;
  }

  return action;
}

export function pendingActionCount(): number {
  evict();
  return store.size;
}

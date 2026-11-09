import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface Session {
  id: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const MAX_SESSIONS = 50;
const MAX_MESSAGES = 40;

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  getOrCreate(providedId?: string): Session {
    this.evictExpired();

    if (providedId) {
      const existing = this.sessions.get(providedId);
      if (existing) {
        existing.updatedAt = Date.now();
        return existing;
      }
    }

    const session: Session = {
      id: providedId && providedId.length <= 64 ? providedId : randomUUID(),
      messages: [],
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    this.evictOverflow();
    return session;
  }

  history(sessionId: string): ChatMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  append(sessionId: string, role: ChatMessage['role'], text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages.push({ role, text: text.slice(0, 4000) });
    if (session.messages.length > MAX_MESSAGES) {
      session.messages.splice(0, session.messages.length - MAX_MESSAGES);
    }
    session.updatedAt = Date.now();
  }

  private evictExpired(): void {
    const cutoff = Date.now() - config.SESSION_TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  private evictOverflow(): void {
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (oldest.done) break;
      this.sessions.delete(oldest.value);
    }
  }
}

export const sessionStore = new SessionStore();

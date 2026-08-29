import type { SessionData, ProcessingProgressEvent } from '@/types/session';

/**
 * Pure in-memory store, as required by the spec ("Storage: Temporary local
 * storage, No database"). Data lives for the lifetime of the Node process
 * and is cleared on a TTL so a long-running dev/preview server doesn't leak
 * memory across many uploads.
 *
 * NOTE: on Vercel's serverless runtime each invocation may run in a fresh
 * process, so this store is authoritative only for a single warm lambda.
 * For the assignment's "no database" requirement this is acceptable and is
 * called out explicitly in skills/Deployment Guide.md and the README
 * troubleshooting section -- the fix for true multi-instance persistence
 * would be Vercel KV / Redis, intentionally out of scope here.
 */
class SessionStore {
  private sessions = new Map<string, SessionData>();
  private listeners = new Map<string, Set<(e: ProcessingProgressEvent) => void>>();
  private ttlMs: number;

  constructor() {
    this.ttlMs = Number(process.env.SESSION_TTL_MINUTES ?? 120) * 60_000;
    // Periodic sweep; harmless no-op cost on serverless (timer dies with the process).
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.sweep(), 5 * 60_000);
    }
  }

  create(sessionId: string): SessionData {
    const session: SessionData = {
      sessionId,
      createdAt: Date.now(),
      questionPaper: null,
      answerSheet: null,
      stage: 'idle',
      questions: [],
      answers: [],
      mapping: null,
      grading: null,
      errorMessage: null,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  getOrCreate(sessionId: string): SessionData {
    return this.get(sessionId) ?? this.create(sessionId);
  }

  update(sessionId: string, patch: Partial<SessionData>): SessionData {
    const existing = this.getOrCreate(sessionId);
    const updated = { ...existing, ...patch };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.listeners.delete(sessionId);
  }

  /** Subscribe to progress events for a session (used by the SSE route). */
  subscribe(sessionId: string, cb: (e: ProcessingProgressEvent) => void): () => void {
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(cb);
    this.listeners.set(sessionId, set);
    return () => set.delete(cb);
  }

  emit(sessionId: string, event: ProcessingProgressEvent): void {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const cb of set) cb(event);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > this.ttlMs) {
        this.delete(id);
      }
    }
  }
}

// A module-level singleton survives across requests within the same warm
// Node process/lambda, which is what "in-memory only" needs.
declare global {
  // eslint-disable-next-line no-var
  var __vedaSessionStore: SessionStore | undefined;
}

export const sessionStore: SessionStore =
  globalThis.__vedaSessionStore ?? (globalThis.__vedaSessionStore = new SessionStore());

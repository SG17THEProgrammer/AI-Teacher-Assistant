'use client';

import { useEffect, useState } from 'react';
import type { SessionData } from '@/types/session';

const KEY = 'veda_session';

interface PersistedSession {
  sessionId: string;
  phase: 'results';
  snapshot: SessionData;
  savedAt: number;
}

export function saveSessionToStorage(sessionId: string, data: SessionData) {
  try {
    const payload: PersistedSession = {
      sessionId,
      phase: 'results',
      snapshot: data,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // storage full or unavailable — silently skip
  }
}

export function clearSessionFromStorage() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function usePersistedSession(): PersistedSession | null {
  const [persisted, setPersisted] = useState<PersistedSession | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed: PersistedSession = JSON.parse(raw);
      // Only restore if saved within last 2 hours
      if (Date.now() - parsed.savedAt < 2 * 60 * 60 * 1000) {
        setPersisted(parsed);
      } else {
        localStorage.removeItem(KEY);
      }
    } catch {}
  }, []);

  return persisted;
}
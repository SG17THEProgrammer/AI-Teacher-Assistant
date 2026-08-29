'use client';

import { useEffect, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import type { SessionData } from '@/types/session';

const DB_NAME = 'veda_history_db';
const DB_VERSION = 1;
const STORE_NAME = 'history';
const MAX_HISTORY = 20;

export interface HistoryEntry {
  sessionId: string;
  snapshot: SessionData;
  savedAt: number;
  questionPaperName: string;
  answerSheetName: string;
  score: string; // e.g. "9/10"
  percent: number; // 0-100
}

function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      store.createIndex('savedAt', 'savedAt');
    },
  });
}

// ── Write ────────────────────────────────────────────────────────────────────

export async function saveSessionToHistory(sessionId: string, data: SessionData) {
  try {
    const summary = data.grading?.summary;
    const score = summary
      ? `${summary.totalMarksAwarded}/${summary.totalMarksPossible}`
      : '—';
    const percent = summary?.percentage ?? 0;

    const entry: HistoryEntry = {
      sessionId,
      snapshot: data,
      savedAt: Date.now(),
      questionPaperName: data.questionPaper?.originalName ?? 'Question Paper',
      answerSheetName: data.answerSheet?.originalName ?? 'Answer Sheet',
      score,
      percent,
    };

    const db = await getDb();
    await db.put(STORE_NAME, entry);
    await trimHistory(db);
  } catch {
    // storage unavailable — silently skip
  }
}

async function trimHistory(db: IDBPDatabase) {
  const all = await db.getAllFromIndex(STORE_NAME, 'savedAt');
  const excess = all.length - MAX_HISTORY;
  if (excess <= 0) return;
  // 'savedAt' index yields oldest-first; drop the oldest excess entries
  const stale = all.slice(0, excess);
  await Promise.all(stale.map((e) => db.delete(STORE_NAME, e.sessionId)));
}

export async function removeFromHistory(sessionId: string) {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, sessionId);
  } catch {}
}

// ── Read ─────────────────────────────────────────────────────────────────────

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(STORE_NAME, 'savedAt');
    // Drop entries older than 7 days, newest first
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return all.filter((e) => e.savedAt > cutoff).reverse();
  } catch {
    return [];
  }
}

export function useHistory(version?: number): HistoryEntry[] {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadHistory().then((h) => {
      if (!cancelled) setHistory(h);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return history;
}

export async function getMostRecentSession(): Promise<HistoryEntry | null> {
  const h = await loadHistory();
  return h[0] ?? null;
}
'use client';

import { useEffect, useState } from 'react';
import type { SessionData } from '@/types/session';

const HISTORY_KEY = 'veda_history';
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

// ── Write ────────────────────────────────────────────────────────────────────

export function saveSessionToHistory(sessionId: string, data: SessionData) {
  try {
    const history = loadHistory();
    const existing = history.findIndex((e) => e.sessionId === sessionId);

    const summary = data.grading?.summary;
    const score = summary
      ? `${summary.totalAwarded}/${summary.totalPossible}`
      : '—';
    const percent = summary?.percentScore ?? 0;

    const entry: HistoryEntry = {
      sessionId,
      snapshot: data,
      savedAt: Date.now(),
      questionPaperName: data.questionPaper?.originalName ?? 'Question Paper',
      answerSheetName: data.answerSheet?.originalName ?? 'Answer Sheet',
      score,
      percent,
    };

    if (existing >= 0) {
      history[existing] = entry; // update in place
    } else {
      history.unshift(entry); // newest first
    }

    // Keep only the most recent MAX_HISTORY entries
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full — silently skip
  }
}

export function removeFromHistory(sessionId: string) {
  try {
    const history = loadHistory().filter((e) => e.sessionId !== sessionId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// ── Read ─────────────────────────────────────────────────────────────────────

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: HistoryEntry[] = JSON.parse(raw);
    // Drop entries older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return parsed.filter((e) => e.savedAt > cutoff);
  } catch {
    return [];
  }
}

export function useHistory(version?: number): HistoryEntry[] {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setHistory(loadHistory());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return history;
}

export function getMostRecentSession(): HistoryEntry | null {
  const h = loadHistory();
  return h[0] ?? null;
}
/**
 * Normalizes wildly varying question-number formats -- "Ans 5", "Q.5",
 * "5.", "Question 5", "5)", "5 -", "11.b", "11(b)" -- into a canonical
 * label + numeric sort key, so Phase 1 (number matching) of the mapping
 * engine can compare labels reliably regardless of how the student wrote
 * them or how the question paper printed them.
 *
 * Canonical label shape: "<num>" or "<num>(<letter>)", e.g. "4", "4(a)".
 */
export interface NormalizedNumber {
  /** Canonical comparable label, e.g. "4(a)" */
  canonical: string;
  /** Parent question number without sub-part, e.g. "4" */
  parent: string;
  subPart: string | null; // "a", "b", ... or null
  /** Sortable numeric key: parent * 100 + subPart charcode offset */
  sortKey: number;
}

const PREFIX_WORDS = /^(ans|answer|question|qn|q)\.?\s*/i;

export function normalizeQuestionNumber(raw: string | null | undefined): NormalizedNumber | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(PREFIX_WORDS, '');
  s = s.replace(/^q\.?\s*/i, ''); // second pass catches "Q.5" after "Ans" strip no-ops
  s = s.trim();

  // Strip a leading "." like "5." -> "5", trailing ")" / ":" / "-"
  s = s.replace(/^[.\-:]+/, '').replace(/[.\-:)]+$/, '');
  s = s.trim();

  // Patterns: "4a", "4 a", "4(a)", "4.a", "4-a", "11.b". The letter itself
  // is intentionally not restricted to a-d: real sub-parts are almost
  // always a-d, but OCR noise can turn "a" into something else entirely
  // (e.g. "o", "e", "0") -- and to keep fuzzy-similarity comparisons
  // meaningful, a garbled label must still normalize into the same
  // "parent(x)" shape as a clean one, or the two canonical strings become
  // structurally different and Levenshtein similarity collapses even for
  // a single-character OCR slip.
  const subPartMatch = s.match(/^(\d+)\s*[.(\-\s]*\(?\s*([a-zA-Z0-9])\)?\s*$/);
  if (subPartMatch) {
    const parent = subPartMatch[1]!;
    const subPart = subPartMatch[2]!.toLowerCase();
    const charOffset = /[a-z]/.test(subPart) ? subPart.charCodeAt(0) - 96 : 50 + subPart.charCodeAt(0);
    return {
      canonical: `${parent}(${subPart})`,
      parent,
      subPart,
      sortKey: Number(parent) * 100 + charOffset,
    };
  }

  // Plain number: "5"
  const plainMatch = s.match(/^(\d+)$/);
  if (plainMatch) {
    const parent = plainMatch[1]!;
    return { canonical: parent, parent, subPart: null, sortKey: Number(parent) * 100 };
  }

  // Roman numerals or lettered-only questions (rare, but don't crash): keep as-is.
  return {
    canonical: s.toLowerCase(),
    parent: s.toLowerCase(),
    subPart: null,
    sortKey: Number.MAX_SAFE_INTEGER,
  };
}

export function computeQuestionOrder(questionNumber: string): number {
  return normalizeQuestionNumber(questionNumber)?.sortKey ?? Number.MAX_SAFE_INTEGER;
}

/** True if two raw labels normalize to the same canonical question. */
export function sameQuestion(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeQuestionNumber(a);
  const nb = normalizeQuestionNumber(b);
  if (!na || !nb) return false;
  return na.canonical === nb.canonical;
}

/** Levenshtein-based fuzzy label similarity, for near-miss OCR noise like "4(a)" vs "4(o)". */
export function labelSimilarity(a: string, b: string): number {
  const na = normalizeQuestionNumber(a)?.canonical ?? a;
  const nb = normalizeQuestionNumber(b)?.canonical ?? b;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length, 1);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

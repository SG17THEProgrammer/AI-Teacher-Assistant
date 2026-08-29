export type RepairResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Best-effort recovery of JSON from an LLM response that is *usually*
 * well-formed but occasionally wraps output in markdown fences, adds a
 * trailing comma, uses smart quotes, or gets truncated mid-array.
 *
 * Order of operations matters: cheap, common fixes first; only fall back
 * to bracket-balancing/truncation repair if the string still doesn't parse.
 */
export function repairJson<T>(raw: string): RepairResult<T> {
  const attempts = [
    raw,
    stripMarkdownFences(raw),
    stripMarkdownFences(raw).trim(),
  ];

  for (const candidate of attempts) {
    const parsed = tryParse<T>(candidate);
    if (parsed.ok) return parsed;
  }

  const cleaned = stripMarkdownFences(raw).trim();
  const normalized = normalizeQuotesAndTrailingCommas(cleaned);
  const normalizedParsed = tryParse<T>(normalized);
  if (normalizedParsed.ok) return normalizedParsed;

  const balanced = balanceBracketsForTruncation(normalized);
  const balancedParsed = tryParse<T>(balanced);
  if (balancedParsed.ok) return balancedParsed;

  const extracted = extractLargestJsonSpan(cleaned);
  if (extracted) {
    const extractedParsed = tryParse<T>(extracted);
    if (extractedParsed.ok) return extractedParsed;
    const extractedBalanced = balanceBracketsForTruncation(extracted);
    const extractedBalancedParsed = tryParse<T>(extractedBalanced);
    if (extractedBalancedParsed.ok) return extractedBalancedParsed;
  }

  return { ok: false, error: 'Could not parse JSON after all repair strategies' };
}

function tryParse<T>(candidate: string): RepairResult<T> {
  try {
    return { ok: true, value: JSON.parse(candidate) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown parse error' };
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
}

function normalizeQuotesAndTrailingCommas(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1'); // trailing commas before } or ]
}

/**
 * If the model got cut off mid-array/object (hit max output tokens), close
 * out any open strings/brackets so we can still salvage the complete
 * elements that were emitted before the cut-off point.
 */
function balanceBracketsForTruncation(text: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastSafeIndex = text.length;
  let stackAtLastSafeIndex: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    } else if ((ch === ',' ) && stack.length > 0) {
      lastSafeIndex = i; // remember last complete-element boundary
      stackAtLastSafeIndex = [...stack];
    }
  }

  if (stack.length === 0 && !inString) {
    return text; // already balanced
  }

  // Truncate back to the last complete element, then close using the
  // bracket depth that was actually open AT that boundary -- not the
  // depth reached by the end of the (partially garbage) full scan, which
  // would include brackets opened by the incomplete trailing element we
  // are discarding.
  const truncated = text.slice(0, lastSafeIndex);
  const closers: string[] = [];
  for (let i = stackAtLastSafeIndex.length - 1; i >= 0; i--) {
    closers.push(stackAtLastSafeIndex[i] === '{' ? '}' : ']');
  }
  return truncated + closers.join('');
}

function extractLargestJsonSpan(text: string): string | null {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);

  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end <= start) return null;

  return text.slice(start, end + 1);
}

import { describe, it, expect } from 'vitest';
import { repairJson } from '@/lib/gemini/jsonRepair';

describe('repairJson', () => {
  it('parses already-valid JSON untouched', () => {
    const result = repairJson<{ a: number }>('{"a": 1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips markdown code fences', () => {
    const result = repairJson<{ a: number }>('```json\n{"a": 1}\n```');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('removes trailing commas', () => {
    const result = repairJson<{ a: number; b: number }>('{"a": 1, "b": 2,}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it('normalizes smart quotes', () => {
    const result = repairJson<{ a: number }>('{\u201Ca\u201D: 1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it('extracts JSON surrounded by commentary text', () => {
    const result = repairJson<{ a: number }>('Here is the JSON:\n{"a": 1}\nHope that helps!');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it('recovers complete elements when the response is truncated mid-array', () => {
    const truncated = '{"questions": [{"q":"1"}, {"q":"2"}, {"q":"3"';
    const result = repairJson<{ questions: { q: string }[] }>(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The incomplete third element must be dropped, but both complete
      // elements before it must be preserved -- this is a real regression
      // test: an earlier version of the bracket-closer logic used the
      // wrong stack snapshot and silently dropped the second element too.
      expect(result.value.questions).toEqual([{ q: '1' }, { q: '2' }]);
    }
  });

  it('recovers a single complete element when truncated after just one', () => {
    const truncated = '{"questions": [{"q":"1"}, {"q":"2"';
    const result = repairJson<{ questions: { q: string }[] }>(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.questions).toEqual([{ q: '1' }]);
    }
  });

  it('fails gracefully on completely non-JSON text', () => {
    const result = repairJson('not json at all, sorry');
    expect(result.ok).toBe(false);
  });
});

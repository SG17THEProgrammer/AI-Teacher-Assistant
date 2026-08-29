import { describe, it, expect } from 'vitest';
import {
  normalizeQuestionNumber,
  sameQuestion,
  labelSimilarity,
  computeQuestionOrder,
} from '@/lib/mapping/numberNormalizer';

describe('normalizeQuestionNumber', () => {
  it('strips common student prefixes to a bare number', () => {
    expect(normalizeQuestionNumber('Ans 5')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('Ans. 5')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('Q.5')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('Q5')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('Question 5')?.canonical).toBe('5');
  });

  it('strips trailing punctuation variants', () => {
    expect(normalizeQuestionNumber('5.')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('5)')?.canonical).toBe('5');
    expect(normalizeQuestionNumber('5 -')?.canonical).toBe('5');
  });

  it('normalizes sub-part questions to a consistent parenthetical shape', () => {
    expect(normalizeQuestionNumber('4(a)')?.canonical).toBe('4(a)');
    expect(normalizeQuestionNumber('4a')?.canonical).toBe('4(a)');
    expect(normalizeQuestionNumber('4.a')?.canonical).toBe('4(a)');
    expect(normalizeQuestionNumber('4-a')?.canonical).toBe('4(a)');
    expect(normalizeQuestionNumber('11.b')?.canonical).toBe('11(b)');
  });

  it('returns null for empty/missing input', () => {
    expect(normalizeQuestionNumber(null)).toBeNull();
    expect(normalizeQuestionNumber(undefined)).toBeNull();
    expect(normalizeQuestionNumber('')).toBeNull();
  });
});

describe('sameQuestion', () => {
  it('treats differently-formatted labels for the same question as equal', () => {
    expect(sameQuestion('Ans 5', 'Q.5')).toBe(true);
    expect(sameQuestion('5.', 'Question 5')).toBe(true);
  });

  it('treats different sub-parts as distinct questions', () => {
    expect(sameQuestion('4(a)', '4(b)')).toBe(false);
    expect(sameQuestion('4', '4(a)')).toBe(false);
  });
});

describe('computeQuestionOrder', () => {
  it('sorts sub-parts before the next parent question, in letter order', () => {
    const order4a = computeQuestionOrder('4(a)');
    const order4b = computeQuestionOrder('4(b)');
    const order5 = computeQuestionOrder('5');
    expect(order4a).toBeLessThan(order4b);
    expect(order4b).toBeLessThan(order5);
  });
});

describe('labelSimilarity', () => {
  it('scores a single-character OCR slip as highly similar', () => {
    // "a" misread as "o" -- still a single substitution once normalized
    // to the same "4(x)" shape, so similarity should clear a reasonable
    // fuzzy-match threshold (this exact regression was caught during
    // development: an earlier version of the normalizer scored this at
    // 0.5 instead of 0.75 due to inconsistent parenthesis handling).
    expect(labelSimilarity('4(a)', '4(o)')).toBeCloseTo(0.75, 2);
  });

  it('scores identical canonical labels as 1', () => {
    expect(labelSimilarity('Ans 5', 'Q.5')).toBe(1);
  });
});

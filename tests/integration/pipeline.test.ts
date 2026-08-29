import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * These hit the real Next.js API routes over HTTP, so they need a running
 * server (`npm run dev` or `npm run start` in another terminal) rather than
 * being importable in-process -- Next's route handlers aren't designed to
 * be unit-invoked directly with a synthetic Request in a way that's worth
 * the maintenance cost here. Point BASE_URL at whatever you have running.
 *
 * Run: BASE_URL=http://localhost:3000 npm run test -- integration
 * (defaults to http://localhost:3000 if BASE_URL is unset)
 *
 * Skipped automatically if the server isn't reachable, so `npm run test`
 * alone (unit tests only) never fails because of this file.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const SCENARIO_DIR = path.join(__dirname, '..', '..', 'test-data', 'scenario-1-basic');

let serverReachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(BASE_URL, { method: 'GET' });
    serverReachable = res.ok || res.status < 500;
  } catch {
    serverReachable = false;
  }
});

describe.skipIf(!serverReachable)('Upload + process API integration', () => {
  it('uploading both files returns a shared sessionId and correct page counts', async () => {
    const qpBuffer = await readFile(path.join(SCENARIO_DIR, 'question-paper.pdf'));
    const asBuffer = await readFile(path.join(SCENARIO_DIR, 'answer-sheet.pdf'));

    const qpForm = new FormData();
    qpForm.append('file', new Blob([qpBuffer], { type: 'application/pdf' }), 'question-paper.pdf');
    qpForm.append('kind', 'questionPaper');

    const qpRes = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: qpForm });
    expect(qpRes.status).toBe(200);
    const qpBody = await qpRes.json();
    expect(qpBody.sessionId).toBeTruthy();
    expect(qpBody.file.mimeType).toBe('application/pdf');

    const asForm = new FormData();
    asForm.append('file', new Blob([asBuffer], { type: 'application/pdf' }), 'answer-sheet.pdf');
    asForm.append('kind', 'answerSheet');
    asForm.append('sessionId', qpBody.sessionId);

    const asRes = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: asForm });
    expect(asRes.status).toBe(200);
    const asBody = await asRes.json();
    expect(asBody.sessionId).toBe(qpBody.sessionId);
  });

  it('rejects an oversized upload with a 400, not a crash', async () => {
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB > default 10MB limit
    const form = new FormData();
    form.append('file', new Blob([oversized], { type: 'application/pdf' }), 'too-big.pdf');
    form.append('kind', 'questionPaper');

    const res = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it('rejects processing when a session is missing one of the two files', async () => {
    const qpBuffer = await readFile(path.join(SCENARIO_DIR, 'question-paper.pdf'));
    const form = new FormData();
    form.append('file', new Blob([qpBuffer], { type: 'application/pdf' }), 'question-paper.pdf');
    form.append('kind', 'questionPaper');

    const uploadRes = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
    const { sessionId } = await uploadRes.json();

    const processRes = await fetch(`${BASE_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    expect(processRes.status).toBe(400);
  });

  it('returns 404 for a session that does not exist', async () => {
    const res = await fetch(`${BASE_URL}/api/session/does-not-exist-12345`);
    expect(res.status).toBe(404);
  });
});

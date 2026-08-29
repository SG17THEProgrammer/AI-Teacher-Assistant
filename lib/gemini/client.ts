import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { repairJson } from './jsonRepair';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Simple rate limiter — free tier allows ~15 RPM on flash models.
// We space calls at least 4 seconds apart to stay safe.
let lastCallTime = 0;
async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, 4000 - (now - lastCallTime));
  if (wait > 0) await sleep(wait);
  lastCallTime = Date.now();
}

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not set. Add it to .env.local (see .env.example) to enable AI extraction and grading.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(apiKey);
  }
  return cachedClient;
}

export class GeminiConfigError extends Error {}
export class GeminiExtractionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && process.env.FORCE_OCR_FALLBACK !== 'true';
}

export interface VisionCallOptions {
  systemInstruction: string;
  prompt: string;
  images?: Buffer[]; // PNG buffers, one per page, in order
  pdfBuffer?: Buffer; // raw PDF bytes — sent as inline document, skips rendering entirely
  maxRetries?: number;
  temperature?: number;
}

/**
 * Calls Gemini Vision with one or more page images and a prompt that
 * demands strict JSON, then repairs and parses the response.
 *
 * Retry policy: up to `maxRetries` attempts total. On a JSON-parse failure
 * we retry once immediately with a "your last response was invalid JSON"
 * correction turn before falling back to exponential backoff for
 * transport/rate-limit errors.
 */
export async function callGeminiVisionJSON<T>(opts: VisionCallOptions): Promise<T> {
  const { systemInstruction, prompt, images = [], pdfBuffer, maxRetries = 3, temperature = 0.1 } = opts;
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction,
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
    },
  });

  const imageParts: Part[] = pdfBuffer
    ? [{ inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } }]
    : images.map((buf) => ({ inlineData: { mimeType: 'image/png', data: buf.toString('base64') } }));

  console.log(`[Gemini] calling model=${MODEL_NAME} pdfBuffer=${!!pdfBuffer} images=${images.length} attempt will start`);

  let lastError: unknown;
  let correctionNote = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rateLimit();
      console.log(`[Gemini] attempt ${attempt + 1}/${maxRetries}`);
      const result = await model.generateContent([
        { text: prompt + correctionNote },
        ...imageParts,
      ]);
      const text = result.response.text();
      console.log(`[Gemini] raw response (first 300 chars):`, text.slice(0, 300));
      const parsed = repairJson<T>(text);
      if (parsed.ok) {
        console.log(`[Gemini] parse OK`);
        return parsed.value;
      }
      console.log(`[Gemini] JSON parse failed:`, parsed.error);
      correctionNote = `\n\nIMPORTANT: your previous response could not be parsed as JSON (${parsed.error}). Return ONLY valid JSON, no markdown fences, no commentary.`;
      lastError = new Error(`JSON parse failed: ${parsed.error}`);
    } catch (err) {
      console.log(`[Gemini] attempt ${attempt + 1} error:`, err instanceof Error ? err.message : err);
      lastError = err;
      const isRateLimit = err instanceof Error && /429|rate|quota/i.test(err.message);
      const backoffMs = isRateLimit ? 2000 * (attempt + 1) : 500 * (attempt + 1);
      await sleep(backoffMs);
    }
  }

  throw new GeminiExtractionError(
    `Gemini vision call failed after ${maxRetries} attempts`,
    lastError
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
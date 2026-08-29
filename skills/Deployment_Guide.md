# Deployment Guide

## What this covers

Deploying to Vercel, and the specific constraints that come from this
app's "no database, temporary local storage, in-memory state" design.

## Steps

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In Vercel: **New Project** → import the repo → framework preset
   auto-detects Next.js.
3. Set environment variables (Project Settings → Environment Variables),
   mirroring `.env.example`:
   - `GEMINI_API_KEY` (required for real AI extraction/grading)
   - `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)
   - `MAPPING_CONFIDENCE_THRESHOLD` (optional, defaults to `0.55`)
   - `NEXT_PUBLIC_MAX_UPLOAD_MB` (optional, defaults to `10`)
4. Deploy. Build command `next build`, output is the standard Next.js
   `.next` directory — no custom build configuration needed.
5. Confirm `app/api/process/route.ts`'s `maxDuration = 60` is within your
   Vercel plan's function duration limit (Hobby: 60s max, matches exactly;
   Pro: up to 300s if you want more headroom for very large uploads).

## Design decisions specific to serverless deployment

**Why in-memory session state works here despite serverless being
stateless-by-default**: the entire pipeline (`extracting-questions` →
`extracting-answers` → `mapping` → `grading`) runs inside a *single*
`/api/process` request via a streamed SSE response (see
`app/api/process/route.ts`). The in-memory `sessionStore`
(`lib/store/sessionStore.ts`) only needs to survive from the initial
upload calls through to the end of that one request's execution on the
same warm lambda instance — it is never relied upon to persist *between*
separate cold invocations. The `globalThis.__vedaSessionStore` pattern
additionally survives across requests on the same warm instance (helpful
in dev and in sustained traffic where Vercel keeps a lambda warm), but
correctness never depends on that survival.

**Why `/tmp` for file storage**: Vercel's serverless functions provide a
writable, ephemeral `/tmp` (512MB by default on most plans). `saveUploadedFile`
and `savePageImages` use `os.tmpdir()` precisely so this works unmodified
whether running locally or on Vercel. It is explicitly *not* meant to
survive across cold starts — the "no database" requirement is satisfied
by design, not by accident.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "GEMINI_API_KEY is not set" error | env var missing/misnamed | Check Vercel Project Settings, redeploy after adding |
| Extraction succeeds but grading returns generic "please review manually" feedback | Gemini call failing silently mid-pipeline, or `FORCE_OCR_FALLBACK=true` left set | Check function logs; unset `FORCE_OCR_FALLBACK` |
| Processing times out around 60s on large multi-page uploads | Vercel plan's function duration cap hit | Upgrade plan for higher `maxDuration`, or reduce `targetDpi`/`maxDimensionPx` in `lib/pdf/pdfToImages.ts` |
| Highlight boxes appear slightly offset | Expected LLM bounding-box imprecision (see `skills/OCR Architecture.md`) | Not a bug per se; consider the two-pass refinement idea in Future Improvements if it's a recurring issue on your document style |
| `sharp`/`canvas` native module build failures during Vercel build | Vercel's build image usually handles both out of the box; regional or platform mismatches are rare but possible | Ensure you're not overriding the Node.js version to something unsupported by the pinned `sharp`/`canvas` versions in `package.json` |
| Page images 404 from the viewer | Session's `/tmp` storage was cleared (cold start between upload and view) | Re-upload and reprocess — this is the documented serverless-ephemeral-storage tradeoff above |

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY
npm run dev
```

No database setup, no Docker, no external services beyond the Gemini API
key — this is intentional per the spec's "no database" requirement.

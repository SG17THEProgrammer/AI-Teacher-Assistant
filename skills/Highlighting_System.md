# Highlighting System

## What this covers

How a click on a question becomes an accurate, animated, zoom-safe
highlight on the answer sheet: `components/results/AnswerSheetViewer.tsx`,
`HighlightOverlay.tsx`, and the `BoundingBox` shape in `types/question.ts`.

## Coordinate system

Every bounding box (`{ page, x, y, width, height }`) is stored as
**fractions of the page (0–1), not pixels**. This is the single most
important design decision in this module: it means a highlight is correct
at any zoom level or container size without any recalculation — a box
positioned at `x: 0.094, width: 0.812` is rendered via plain CSS
percentage `left`/`width`, so it scales automatically with the rendered
`<img>` element's actual on-screen size.

## Why serve rasterized PNG pages instead of rendering the PDF in-browser

The OCR pipeline computes bounding boxes against a specific rasterization
of the PDF (see `skills/OCR Architecture.md`). If the browser rendered the
original PDF itself (via pdf.js in the client, for instance), any
difference in font substitution, anti-aliasing, or DPI between the
server's rasterization and the browser's would shift where "80% down the
page" actually falls, throwing off every highlight by a few pixels — often
enough to visibly miss the intended paragraph. Serving the exact PNG pages
that OCR ran against (`/api/session/[sessionId]/pages/[kind]/[pageNumber]`)
guarantees pixel-for-pixel agreement between what produced the coordinates
and what's on screen.

## Interaction flow

1. Teacher clicks a question in `QuestionList` → `ResultsScreen` sets
   `activeQuestionId`.
2. `AnswerSheetViewer` looks up that question's `QuestionMapping`,
   resolves the primary answer block plus any `additionalAnswerIds`
   (multi-page continuations), and computes which page(s) contain a
   highlight.
3. A `useEffect` auto-navigates to the first page with a highlight, and a
   second effect scrolls the highlighted element into view
   (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) once the
   DOM has the new region rendered.
4. `HighlightOverlay` renders the green box with a small Framer Motion
   scale/fade entrance (`highlight-in` keyframes in `globals.css`), plus a
   floating "Q5" tab, matching the reference design's highlight styling.
5. If the mapping spans multiple pages, a banner above the viewer says so
   and names the pages, so the teacher knows to use the page-forward arrow
   rather than assuming they've seen the whole answer.

Hovering a question (rather than clicking) shows the **mapping-confidence
tooltip** on its marks badge (`MappingConfidenceTooltip` in
`QuestionCard.tsx`) — this is the "Preview Mapping" interaction from the
spec: a lightweight way to sanity-check *why* a pairing was made without
committing to navigating the viewer.

## Zoom handling

Zoom is a plain CSS width multiplier on the page container
(`width: ${zoom * 6.4}px`); because the highlight box is positioned in
percentages *inside* that same container, it scales proportionally with
zoom automatically — there is no separate "recompute highlight position
for zoom level" code path, which eliminates an entire class of
off-by-zoom bugs.

## Tradeoffs

- Multi-page answers currently require a manual "next page" click to see
  the continuation, rather than an auto-scrolling combined view. This
  matches the reference design's page-by-page viewer paradigm (rather
  than a continuous-scroll PDF viewer) and keeps the zoom/page-nav
  interaction consistent with the rest of the screen.
- The highlight box uses a fixed 6px border-radius and translucent fill
  rather than a hairline outline, which is deliberately more forgiving of
  the few-percent imprecision inherent in LLM-estimated bounding boxes
  (see OCR Architecture's tradeoffs section) — a slightly-off soft box
  reads as "roughly this area," while a slightly-off hairline box reads as
  "wrong."

## Future improvements

1. A "show all pages" toggle for multi-page answers (thumbnail strip with
   both highlighted pages visible at once) instead of one-page-at-a-time.
2. Client-side highlight-box nudging: let a teacher drag-correct a
   slightly-off box, feeding a correction signal back for future accuracy
   analysis (currently there is no feedback loop from teacher corrections
   back into the system).
3. Keyboard navigation between questions/highlights for accessibility
   (currently mouse/touch-driven only).

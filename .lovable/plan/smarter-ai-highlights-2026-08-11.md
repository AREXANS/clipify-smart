# Smarter AI Highlights

## Summary
Add an AI-powered option that reads transcript, video metadata, and chapters to pick better viral moments than local keyword matching. Local heuristics remain available and are the fallback when AI fails or credits run out.

## What we will build

1. AI Gateway connection
   - Add `ai` and `@ai-sdk/openai-compatible` dependencies.
   - Create `src/lib/ai-gateway.server.ts` with the Lovable AI Gateway provider helper.

2. AI highlight selector
   - Create `src/lib/highlight-ai.server.ts`.
   - Condense transcript into time-buckets and feed it to an LLM with metadata and chapters.
   - Use structured output to return the same `Highlight[]` shape as `highlight-local.server.ts`.

3. Settings toggle
   - Add `useAi: boolean` to `ClipSettings` and the Zod schema in `clipper.functions.ts`.
   - Add a switch in the settings panel to choose between `AI` and `Lokal` analysis.
   - Update the default to `true` when credits are available.

4. Routing logic in `analyzeVideo`
   - If `useAi` is true and `LOVABLE_API_KEY` is configured, call `selectHighlightsAI`.
   - Otherwise fall back to `selectHighlightsLocal`.
   - If AI fails or returns empty, also fall back to local with a message in the job.

5. UI feedback
   - Show the analysis mode in the job message.
   - Keep the existing loading screen copy honest about AI vs. local.

## Technical details

- Model: `google/gemini-3.6-flash` via Lovable AI Gateway.
- Output: structured `Highlight` with `title`, `start`, `end`, `score`, `reason`, `caption`.
- Prompt focus: Mobile Legends moments, kills, savage/maniac, reactions, callouts, and clear story beats.
- Guard against over-length inputs: bucket transcript, cap number of buckets, and trim metadata.
- Server-side only: `LOVABLE_API_KEY` never reaches the browser.

## Files to change

- `package.json`
- `src/lib/ai-gateway.server.ts` (new)
- `src/lib/highlight-ai.server.ts` (new)
- `src/lib/clip-settings.ts`
- `src/lib/clipper.functions.ts`
- `src/lib/clipper.server.ts`
- `src/components/clipper/settings-panel.tsx`
- `src/routes/index.tsx` (message copy only)

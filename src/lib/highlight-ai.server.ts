import { generateText, Output } from "ai";
import { z } from "zod";
import type { ClipSettings } from "./clip-settings";
import type { Highlight } from "./highlight-local.server";
import type { VideoContext } from "./youtube.server";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const aiOutputSchema = z.object({
  highlights: z.array(
    z.object({
      title: z.string(),
      start_seconds: z.number().optional(),
      end_seconds: z.number().optional(),
      start_time: z.number().optional(),
      end_time: z.number().optional(),
      score: z.number().optional(),
      reason: z.string(),
      caption: z.string(),
    }),
  ),
});

function buildPrompt(ctx: VideoContext, settings: ClipSettings, buckets: string[]) {
  const chapters =
    ctx.chapters.map((c) => `- ${formatTime(c.start)} (${c.start}s): ${c.title}`).join("\n") ||
    "Tidak ada chapter.";

  const transcript = buckets.join("\n");

  return `Kamu adalah editor video Mobile Legends yang jago memilih momen viral.
Analisis video berikut dan pilih ${settings.clipCount} klip terbaik yang cocok untuk TikTok/Reels/Shorts.

METADATA:
- Judul: ${ctx.title}
- Channel: ${ctx.author}
- Durasi: ${formatTime(ctx.durationSeconds)} (${ctx.durationSeconds}s)
- Deskripsi: ${ctx.description.slice(0, 800)}

CHAPTER:
${chapters}

TRANSCRIPT (ringkas per ${settings.removeSilence ? "20 detik, sudah dikecilkan gap hening" : "20 detik"}):
${transcript}

ATURAN KLIP:
- Setiap klip ${settings.minDuration}s sampai ${settings.maxDuration}s.
- Jumlah klip: ${settings.clipCount}.
- Pilih momen yang paling seru, emosional, atau penuh aksi.
${settings.highlightKills ? "- Prioritaskan kill, savage, maniac, war, clutch, lord/turtle, dan reaksi kaget streamer." : ""}
${settings.removeSilence ? "- Hindari jeda/jeda panjang; klip harus padat bicara/aksi." : ""}
${settings.addHook ? "- Buat judul menarik dengan hook di awal (contoh: 'Momen Paling Gila!', 'Savage di Detik Terakhir!')." : ""}
- Alasan harus menjelaskan kenapa momen itu viral.
- Caption adalah 1-2 kalimat puncak yang muncul di klip.
- Klip tidak boleh tumpang tindih.

FORMAT KELUARAN (JSON):
Gunakan field name persis berikut untuk setiap highlight:
{
  "highlights": [
    {
      "title": "...",
      "start_seconds": 120,
      "end_seconds": 150,
      "score": 85,
      "reason": "...",
      "caption": "..."
    }
  ]
}
Score 1-100. Semua timestamp dalam detik (0 sampai ${ctx.durationSeconds}).
`;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function condenseForAi(cues: VideoContext["transcript"], bucketSeconds = 20, maxBuckets = 200) {
  const buckets = new Map<number, string[]>();
  for (const cue of cues) {
    const key = Math.floor(cue.start / bucketSeconds) * bucketSeconds;
    const list = buckets.get(key) ?? [];
    list.push(cue.text);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, maxBuckets)
    .map(([start, texts]) => `[${start}s] ${texts.join(" ").slice(0, 300)}`);
}

function normalizeHighlights(
  raw: z.infer<typeof aiOutputSchema>,
  ctx: VideoContext,
  settings: ClipSettings,
): Highlight[] {
  const total = ctx.durationSeconds;
  const min = settings.minDuration;
  const max = settings.maxDuration;
  const picked: Highlight[] = [];

  for (const h of raw.highlights.slice(0, settings.clipCount)) {
    const start = Math.max(0, Math.floor(h.start_seconds ?? h.start_time ?? 0));
    const rawEnd = h.end_seconds ?? h.end_time;
    let end = rawEnd ? Math.min(total || rawEnd, Math.ceil(rawEnd)) : start + min;
    if (end - start < min) end = Math.min(total || end + min, start + min);
    if (end - start > max) end = start + max;
    if (total && end > total) end = total;
    if (start >= end) continue;
    if (picked.some((p) => start < p.end && end > p.start)) continue;
    picked.push({
      title: h.title.slice(0, 90),
      start,
      end,
      score: Math.max(55, Math.min(99, Math.round(h.score ?? 80))),
      reason: h.reason.slice(0, 220),
      caption: h.caption.slice(0, 120),
    });
  }

  return picked.sort((a, b) => a.start - b.start);
}

export async function selectHighlightsAI(
  ctx: VideoContext,
  settings: ClipSettings,
): Promise<{ highlights: Highlight[]; source: "ai" }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY tidak dikonfigurasi.");

  const buckets = condenseForAi(ctx.transcript);
  if (buckets.length === 0) {
    throw new Error("Transkrip kosong, tidak bisa analisis AI.");
  }

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3.6-flash");

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: aiOutputSchema }),
      prompt: buildPrompt(ctx, settings, buckets),
    });

    return { highlights: normalizeHighlights(result.output, ctx, settings), source: "ai" };
  } catch (error) {
    if (error && typeof error === "object" && "text" in error) {
      const text = String(error.text ?? "");
      if (text) {
        const parsed = safeParse(text);
        if (parsed) return { highlights: normalizeHighlights(parsed, ctx, settings), source: "ai" };
      }
    }
    throw error;
  }
}

function safeParse(text: string): z.infer<typeof aiOutputSchema> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const json = match ? match[0] : text;
    return aiOutputSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

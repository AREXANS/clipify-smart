import type { ClipSettings } from "./clip-settings";
import { condenseTranscript, type VideoContext } from "./youtube.server";

export type Highlight = {
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
};

const MODEL = "google/gemini-3.6-flash";

function buildPrompt(ctx: VideoContext, settings: ClipSettings) {
  const lines = condenseTranscript(ctx.transcript);
  // Batasi ~1200 blok agar aman untuk context window.
  const trimmed =
    lines.length > 1200
      ? [...lines.slice(0, 600), "...", ...lines.slice(-600)]
      : lines;

  const chapterText = ctx.chapters.length
    ? ctx.chapters.map((c) => `[${c.start}s] ${c.title}`).join("\n")
    : "(tidak ada chapter)";

  return `Kamu adalah editor video profesional untuk konten short-form (TikTok/Reels/Shorts).

VIDEO
Judul: ${ctx.title}
Channel: ${ctx.author}
Durasi total: ${ctx.durationSeconds} detik
Deskripsi: ${ctx.description.slice(0, 800)}

CHAPTER
${chapterText}

TRANSKRIP (stempel waktu dalam detik)
${trimmed.join("\n") || "(transkrip tidak tersedia — gunakan judul, deskripsi, dan chapter)"}

TUGAS
Pilih tepat ${settings.clipCount} momen paling menarik untuk dijadikan klip pendek.
Aturan wajib:
- Setiap klip berdurasi antara ${settings.minDuration} dan ${settings.maxDuration} detik.
- start >= 0 dan end <= ${ctx.durationSeconds}.
- Klip tidak boleh saling tumpang tindih dan harus urut menaik.
- Mulai klip tepat sebelum momen puncak agar konteksnya masuk.
${settings.highlightKills ? "- Prioritaskan momen aksi/klimaks: kill beruntun, clutch, war, reaksi kaget, hasil mengejutkan.\n" : ""}${settings.removeSilence ? "- Hindari rentang yang hening atau bertele-tele tanpa dialog.\n" : ""}${settings.addHook ? `- title = hook clickbait maksimal 8 kata dalam bahasa ${settings.subtitleLanguage === "en" ? "Inggris" : "Indonesia"}.\n` : "- title = deskripsi netral singkat isi klip.\n"}- reason = satu kalimat singkat berbasis bukti dari transkrip (kutip kata kuncinya).
- score = 0-100 tingkat potensi viral.`;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["clips"],
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "start", "end", "score", "reason"],
        properties: {
          title: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          score: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export async function selectHighlights(
  ctx: VideoContext,
  settings: ClipSettings,
): Promise<Highlight[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI belum dikonfigurasi (LOVABLE_API_KEY tidak ada).");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Kamu memilih highlight video secara akurat dan hanya membalas JSON sesuai skema.",
        },
        { role: "user", content: buildPrompt(ctx, settings) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "highlights", strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Batas permintaan AI tercapai, coba lagi sebentar lagi.");
    if (res.status === 402) throw new Error("Kredit AI habis. Tambahkan kredit di workspace.");
    throw new Error(`Analisis AI gagal [${res.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { clips?: Highlight[] };
  const clips = parsed.clips ?? [];

  return clips
    .map((c) => {
      const start = Math.max(0, Math.round(c.start));
      const rawEnd = Math.round(c.end);
      const min = settings.minDuration;
      const max = settings.maxDuration;
      const duration = Math.min(max, Math.max(min, rawEnd - start));
      const end = Math.min(
        ctx.durationSeconds || start + duration,
        start + duration,
      );
      return {
        title: String(c.title ?? "Highlight").slice(0, 90),
        start,
        end,
        score: Math.max(1, Math.min(100, Math.round(c.score ?? 70))),
        reason: String(c.reason ?? "").slice(0, 240),
      };
    })
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, settings.clipCount);
}

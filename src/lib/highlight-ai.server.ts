import type { ClipSettings } from "./clip-settings";
import { condenseTranscript, type VideoContext } from "./youtube.server";

export type Highlight = {
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  caption: string;
};

const MODEL = "google/gemini-3.6-flash";

function buildPrompt(ctx: VideoContext, settings: ClipSettings) {
  const lines = condenseTranscript(ctx.transcript);
  const trimmed =
    lines.length > 900 ? [...lines.slice(0, 450), "...", ...lines.slice(-450)] : lines;

  const chapterText = ctx.chapters.length
    ? `\nCHAPTER\n${ctx.chapters.map((c) => `[${c.start}s] ${c.title}`).join("\n")}`
    : "";
  const transcriptText = trimmed.length
    ? `\nTRANSKRIP (detik)\n${trimmed.join("\n")}`
    : "";

  const bahasa = settings.subtitleLanguage === "en" ? "Inggris" : "Indonesia";

  return `Kamu editor video profesional untuk konten short-form (TikTok/Reels/Shorts).
Tonton video di bawah ini secara langsung, lalu tentukan potongan terbaiknya.

VIDEO
Judul: ${ctx.title}
Channel: ${ctx.author}
Durasi total: ${ctx.durationSeconds || "tidak diketahui"} detik
Deskripsi: ${ctx.description.slice(0, 600)}${chapterText}${transcriptText}

TUGAS
Pilih tepat ${settings.clipCount} momen terbaik.
Aturan wajib:
- Durasi tiap klip antara ${settings.minDuration} dan ${settings.maxDuration} detik.
- start >= 0${ctx.durationSeconds ? ` dan end <= ${ctx.durationSeconds}` : ""}, klip tidak boleh tumpang tindih, urut menaik.
- Mulai sedikit sebelum puncak momen supaya konteksnya terbawa.
${settings.highlightKills ? "- Prioritaskan aksi/klimaks: kill beruntun, savage, clutch, war, reaksi kaget.\n" : ""}${settings.removeSilence ? "- Hindari bagian hening, loading, atau bertele-tele.\n" : ""}${
    settings.layout === "split"
      ? "- Utamakan momen yang reaksi wajah streamer-nya terlihat, karena hasil akhir memakai layout split facecam.\n"
      : settings.layout === "gameplay"
        ? "- Fokus pada aksi di layar gameplay, bukan momen ngobrol.\n"
        : ""
  }- Format akhir ${settings.aspectRatio}, jadi pilih momen yang subjek utamanya jelas.
${settings.addHook ? `- title = hook clickbait maksimal 8 kata dalam bahasa ${bahasa}.\n` : "- title = deskripsi singkat isi klip.\n"}- reason = satu kalimat bukti dari isi video (apa yang benar-benar terjadi di detik itu).
- caption = satu kalimat pendek (maks 9 kata, bahasa ${bahasa}) berisi ucapan atau teks subtitle paling menonjol di klip tersebut.
- score = 0-100 potensi viral.`;
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
        required: ["title", "start", "end", "score", "reason", "caption"],
        properties: {
          title: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          score: { type: "number" },
          reason: { type: "string" },
          caption: { type: "string" },
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
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Kamu menganalisis isi video secara akurat dan hanya membalas JSON sesuai skema.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(ctx, settings) },
            {
              type: "video_url",
              video_url: { url: `https://www.youtube.com/watch?v=${ctx.videoId}` },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "highlights", strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429)
      throw new Error("Batas permintaan AI tercapai, coba lagi sebentar lagi.");
    if (res.status === 402)
      throw new Error("Kredit AI habis. Tambahkan kredit di workspace kamu.");
    throw new Error(`Analisis AI gagal [${res.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  let parsed: { clips?: Highlight[] };
  try {
    parsed = JSON.parse(content) as { clips?: Highlight[] };
  } catch {
    throw new Error("AI mengembalikan hasil yang tidak bisa dibaca. Coba ulangi.");
  }

  const total = ctx.durationSeconds || Number.MAX_SAFE_INTEGER;

  return (parsed.clips ?? [])
    .map((c) => {
      const start = Math.max(0, Math.round(Number(c.start) || 0));
      const rawDuration = Math.round((Number(c.end) || 0) - start);
      const duration = Math.min(
        settings.maxDuration,
        Math.max(settings.minDuration, rawDuration),
      );
      const end = Math.min(total, start + duration);
      const rawScore = Number(c.score) || 70;
      return {
        title: String(c.title ?? "Highlight").slice(0, 90),
        start,
        end,
        score: Math.max(1, Math.min(100, Math.round(rawScore <= 10 ? rawScore * 10 : rawScore))),
        reason: String(c.reason ?? "").slice(0, 240),
        caption: String(c.caption ?? "").slice(0, 120),
      };
    })
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, settings.clipCount);
}

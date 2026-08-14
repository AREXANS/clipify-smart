import type { ClipSettings } from "./clip-settings";
import type { TranscriptCue, VideoContext } from "./youtube.server";

export type Highlight = {
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  caption: string;
};

/** Kata pemicu momen seru — dipakai untuk skor lokal, tanpa AI. */
const ACTION_WORDS = [
  "savage",
  "maniac",
  "triple",
  "double",
  "kill",
  "bunuh",
  "clutch",
  "war",
  "gg",
  "wow",
  "gila",
  "anjir",
  "buset",
  "mantap",
  "epic",
  "comeback",
  "lord",
  "turtle",
  "tower",
  "push",
  "ulti",
  "ultimate",
  "combo",
  "one shot",
  "menang",
  "kalah",
  "hoki",
  "keren",
  "parah",
  "sadis",
  "auto",
  "pecah",
];

const HYPE_WORDS = [
  "!",
  "?",
  "haha",
  "wkwk",
  "astaga",
  "ya ampun",
  "gokil",
  "serius",
  "lihat",
  "liat",
  "bang",
  "guys",
  "nih",
  "banget",
];

function scoreText(text: string, highlightAction: boolean) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of ACTION_WORDS) {
    if (lower.includes(w)) score += highlightAction ? 12 : 6;
  }
  for (const w of HYPE_WORDS) {
    if (lower.includes(w)) score += 3;
  }
  // Kalimat panjang biasanya berisi cerita/penjelasan, bukan momen puncak.
  const words = lower.split(/\s+/).filter(Boolean).length;
  score += Math.min(8, words / 3);
  return score;
}

function titleFrom(text: string, addHook: boolean) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return addHook ? "Momen Paling Gila!" : "Highlight";
  const words = clean.split(" ").slice(0, 8).join(" ");
  const base = words.charAt(0).toUpperCase() + words.slice(1);
  return (addHook ? `${base}!` : base).slice(0, 90);
}

/**
 * Pemilih highlight lokal: memakai transkrip asli, chapter, dan heuristik
 * kepadatan bicara. Berjalan penuh di server tanpa memanggil layanan AI,
 * jadi tidak memakai kredit dan tidak ada batas pemakaian.
 */
export function selectHighlightsLocal(ctx: VideoContext, settings: ClipSettings): Highlight[] {
  const total =
    ctx.durationSeconds ||
    (ctx.transcript.length ? ctx.transcript[ctx.transcript.length - 1]!.end : 0);
  const target = Math.round((settings.minDuration + settings.maxDuration) / 2);
  const clipLen = Math.max(settings.minDuration, Math.min(settings.maxDuration, target));

  const candidates: (Highlight & { cues: TranscriptCue[] })[] = [];

  if (ctx.transcript.length > 0) {
    // Geser jendela sepanjang durasi klip di sepanjang transkrip.
    const step = Math.max(3, Math.round(clipLen / 3));
    const last = ctx.transcript[ctx.transcript.length - 1]!.end;
    for (let t = 0; t + clipLen <= Math.max(clipLen, last); t += step) {
      const cues = ctx.transcript.filter((c) => c.end > t && c.start < t + clipLen);
      if (cues.length === 0) continue;
      const text = cues.map((c) => c.text).join(" ");
      let score = scoreText(text, settings.highlightKills);
      // Padat bicara = jarang hening.
      const spoken = cues.reduce((sum, c) => sum + (c.end - c.start), 0);
      const density = Math.min(1, spoken / clipLen);
      score += density * (settings.removeSilence ? 25 : 12);
      // Bagian awal video biasanya intro, beri sedikit penalti.
      if (t < 30) score -= 8;
      const best = cues.reduce((a, b) =>
        scoreText(b.text, settings.highlightKills) > scoreText(a.text, settings.highlightKills)
          ? b
          : a,
      );
      candidates.push({
        title: titleFrom(best.text, settings.addHook),
        start: Math.max(0, Math.round(t)),
        end: Math.round(t + clipLen),
        score,
        reason: `Bagian ini padat bicara dan memuat momen: "${best.text.slice(0, 90)}"`,
        caption: best.text.slice(0, 120),
        cues,
      });
    }
  }

  if (candidates.length === 0) {
    // Tanpa transkrip: bagi rata sepanjang video (lewati intro & outro).
    const span = total || clipLen * settings.clipCount;
    const usable = Math.max(clipLen, span - Math.min(60, span * 0.15));
    const gap = Math.max(clipLen, Math.floor(usable / settings.clipCount));
    const offset = Math.min(30, Math.floor(span * 0.05));
    for (let i = 0; i < settings.clipCount; i++) {
      const start = offset + i * gap;
      if (total && start + clipLen > total) break;
      // Judul mengikuti chapter yang mencakup momen; kalau tidak ada, pakai
      // judul video + penanda waktu agar tiap klip punya judul berbeda.
      const chapter = [...ctx.chapters].filter((c) => c.start <= start + clipLen / 2).pop();
      const videoLabel = (ctx.title.split(/[|\-–—•]/)[0] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .slice(0, 6)
        .join(" ");
      const mark = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(
        Math.floor(start % 60),
      ).padStart(2, "0")}`;
      const base = chapter
        ? titleFrom(chapter.title, settings.addHook)
        : titleFrom(videoLabel || "Highlight", settings.addHook);
      candidates.push({
        title: `${base} · Menit ${mark}`.slice(0, 96),

        start,
        end: start + clipLen,
        score: 70 - i * 3,
        reason: chapter
          ? `Mengikuti chapter "${chapter.title}" pada menit ${Math.floor(start / 60)}.`
          : "Dipilih merata di sepanjang video karena transkrip tidak tersedia.",
        caption: chapter?.title ?? "",
        cues: [],
      });
    }
  }

  // Ambil skor tertinggi tanpa tumpang tindih.
  const picked: Highlight[] = [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    if (picked.length >= settings.clipCount) break;
    if (picked.some((p) => c.start < p.end && c.end > p.start)) continue;
    if (total && c.end > total) continue;
    picked.push(c);
  }

  const max = Math.max(1, ...picked.map((p) => p.score));
  const min = Math.min(...picked.map((p) => p.score), 0);

  return picked
    .sort((a, b) => a.start - b.start)
    .map((p) => ({
      ...p,
      score: Math.max(55, Math.min(99, Math.round(55 + ((p.score - min) / (max - min || 1)) * 44))),
    }));
}

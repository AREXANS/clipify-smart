import type { ClipJob, ClipResult, ClipSettings } from "./clip-settings";
import type { Highlight } from "./highlight-local.server";
import { selectHighlightsLocal } from "./highlight-local.server";
import { buildShortsMeta } from "./shorts-meta";
import { cuesBetween, fetchVideoContext } from "./youtube.server";

type ProviderConfig = { baseUrl: string; apiKey: string };

export function getProviderConfig(): ProviderConfig | null {
  const baseUrl = process.env["CLIPPER_API_URL"];
  const apiKey = process.env["CLIPPER_API_KEY"];
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

function embedUrl(videoId: string, start: number, end: number) {
  return `https://www.youtube.com/embed/${videoId}?start=${Math.floor(start)}&end=${Math.ceil(end)}&rel=0&modestbranding=1`;
}

/**
 * Analisis video: ambil metadata + transkrip, lalu pilih highlight dengan AI
 * (jika useAi aktif dan kunci tersedia) atau algoritma lokal.
 */
export async function analyzeVideo(settings: ClipSettings): Promise<ClipJob> {
  const ctx = await fetchVideoContext(settings.url, settings.subtitleLanguage);

  let highlights: Highlight[] = [];
  let analysisMode: "ai" | "lokal" | "lokal fallback ai" = "lokal";
  let aiError: string | undefined;

  if (settings.useAi && process.env["LOVABLE_API_KEY"]) {
    try {
      const { selectHighlightsAI } = await import("./highlight-ai.server");
      const aiResult = await selectHighlightsAI(ctx, settings);
      highlights = aiResult.highlights;
      analysisMode = aiResult.source === "ai" ? "ai" : "lokal";
    } catch (err) {
      aiError = err instanceof Error ? err.message : "Analisis AI gagal";
      highlights = selectHighlightsLocal(ctx, settings);
      analysisMode = "lokal fallback ai";
    }
  }

  if (highlights.length === 0) {
    highlights = selectHighlightsLocal(ctx, settings);
    analysisMode = "lokal";
  }

  if (highlights.length === 0) {
    return {
      id: `analysis_${ctx.videoId}_${Date.now()}`,
      configured: true,
      status: "failed",
      message: "Tidak ada momen yang cocok dengan pengaturan durasi kamu.",
      clips: [],
      videoTitle: ctx.title,
      transcriptAvailable: ctx.transcript.length > 0,
    };
  }

  const clips: ClipResult[] = highlights.map((h, i) => {
    const clipCues = settings.subtitles ? cuesBetween(ctx.transcript, h.start, h.end) : [];
    const cueTexts = clipCues.map((c) => c.text).slice(0, 12);
    const meta = buildShortsMeta({
      clipTitle: h.title,
      reason: h.reason,
      videoTitle: ctx.title,
      lines: cueTexts.length ? cueTexts : h.caption ? [h.caption] : [],
      durationSeconds: h.end - h.start,
    });
    return {
      id: `${ctx.videoId}-${i}-${Math.round(h.start)}`,
      title: h.title,
      startSeconds: h.start,
      endSeconds: h.end,
      score: h.score,
      reason: h.reason,
      status: "ready",
      progress: 100,
      videoId: ctx.videoId,
      previewUrl: embedUrl(ctx.videoId, h.start, h.end),
      subtitleLines: cueTexts.length ? cueTexts : h.caption ? [h.caption] : [],
      shortsTitle: meta.shortsTitle,
      caption: meta.caption,
      hashtags: meta.hashtags,
      subtitleCues: clipCues.length
        ? clipCues
        : h.caption
          ? [{ start: h.start, end: h.end, text: h.caption }]
          : [],
    };
  });

  const modeLabel = {
    ai: "Analisis AI",
    lokal: "Analisis lokal",
    "lokal fallback ai": "Analisis lokal (fallback AI)",
  }[analysisMode];

  return {
    id: `analysis_${ctx.videoId}_${Date.now()}`,
    configured: true,
    status: "completed",
    message: `${modeLabel} memilih ${clips.length} momen${
      ctx.transcript.length
        ? ` (dibantu transkrip asli ${ctx.transcript.length} baris${ctx.transcriptLanguage ? `, ${ctx.transcriptLanguage}` : ""})`
        : ""
    }.${aiError ? ` Catatan AI: ${aiError}.` : ""}`,
    clips,
    videoTitle: ctx.title,
    transcriptAvailable: ctx.transcript.length > 0,
  };
}

async function providerFetch(config: ProviderConfig, path: string, init?: RequestInit) {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Layanan render gagal [${res.status}]: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Kirim hasil analisis ke layanan render agar menjadi file MP4 siap unduh. */
export async function createProviderJob(
  config: ProviderConfig,
  settings: ClipSettings,
  analysis: ClipJob,
): Promise<ClipJob> {
  const payload = await providerFetch(config, "/jobs", {
    method: "POST",
    body: JSON.stringify({
      source_url: settings.url,
      aspect_ratio: settings.aspectRatio,
      layout: settings.layout,
      facecam_share: settings.facecamShare / 100,
      facecam_source: settings.facecamSource,
      facecam_zoom: settings.facecamZoom / 100,
      facecam_offset_x: settings.facecamOffsetX / 100,
      facecam_offset_y: settings.facecamOffsetY / 100,
      subtitles: settings.subtitles,
      subtitle_style: settings.subtitleStyle,
      subtitle_language: settings.subtitleLanguage,
      max_clips: settings.clipCount,
      min_duration: settings.minDuration,
      max_duration: settings.maxDuration,
      add_hook_title: settings.addHook,
      remove_silence: settings.removeSilence,
      highlight_action: settings.highlightKills,
      segments: analysis.clips.map((c) => ({
        id: c.id,
        title: c.title,
        start: c.startSeconds,
        end: c.endSeconds,
      })),
    }),
  });
  return normalizeProviderJob(payload, analysis);
}

export async function fetchProviderJob(config: ProviderConfig, jobId: string): Promise<ClipJob> {
  const payload = await providerFetch(config, `/jobs/${encodeURIComponent(jobId)}`);
  return normalizeProviderJob(payload);
}

function normalizeProviderJob(payload: Record<string, unknown>, analysis?: ClipJob): ClipJob {
  const rawClips = Array.isArray(payload["clips"]) ? payload["clips"] : [];
  const clips: ClipResult[] = rawClips.map((raw, i) => {
    const c = raw as Record<string, unknown>;
    const id = String(c["id"] ?? `clip-${i}`);
    const source = analysis?.clips.find((a) => a.id === id) ?? analysis?.clips[i];
    return {
      id,
      title: String(c["title"] ?? source?.title ?? `Klip ${i + 1}`),
      startSeconds: Number(c["start"] ?? c["start_seconds"] ?? source?.startSeconds ?? 0),
      endSeconds: Number(c["end"] ?? c["end_seconds"] ?? source?.endSeconds ?? 0),
      score: Number(c["score"] ?? source?.score ?? 0),
      reason: String(c["reason"] ?? source?.reason ?? ""),
      status: (c["status"] as ClipResult["status"]) ?? "queued",
      progress: Number(c["progress"] ?? 0),
      downloadUrl: (c["download_url"] as string | undefined) ?? undefined,
      videoId: source?.videoId,
      previewUrl: source?.previewUrl,
      subtitleLines: source?.subtitleLines,
      shortsTitle: source?.shortsTitle,
      caption: source?.caption,
      hashtags: source?.hashtags,
      subtitleCues: source?.subtitleCues,
    };
  });

  return {
    id: String(payload["id"] ?? ""),
    configured: true,
    status: (payload["status"] as ClipJob["status"]) ?? "processing",
    message: (payload["message"] as string | undefined) ?? analysis?.message,
    clips: clips.length ? clips : (analysis?.clips ?? []),
    videoTitle: analysis?.videoTitle,
    transcriptAvailable: analysis?.transcriptAvailable,
  };
}

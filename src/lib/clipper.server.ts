import type { ClipJob, ClipResult, ClipSettings } from "./clip-settings";
import { selectHighlights } from "./highlight-ai.server";
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
 * Analisis nyata: ambil metadata + transkrip asli video, lalu minta AI memilih
 * highlight sesuai pengaturan pengguna. Hasilnya berupa klip dengan timestamp
 * sungguhan yang bisa langsung ditonton.
 */
export async function analyzeVideo(settings: ClipSettings): Promise<ClipJob> {
  const ctx = await fetchVideoContext(settings.url, settings.subtitleLanguage);
  const highlights = await selectHighlights(ctx, settings);

  if (highlights.length === 0) {
    return {
      id: `analysis_${ctx.videoId}_${Date.now()}`,
      configured: true,
      status: "failed",
      message: "AI tidak menemukan momen yang cocok dengan pengaturan durasi kamu.",
      clips: [],
      videoTitle: ctx.title,
      transcriptAvailable: ctx.transcript.length > 0,
    };
  }

  const clips: ClipResult[] = highlights.map((h, i) => {
    const clipCues = settings.subtitles
      ? cuesBetween(ctx.transcript, h.start, h.end)
      : [];
    const cueTexts = clipCues.map((c) => c.text).slice(0, 12);
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
      subtitleCues: clipCues.length
        ? clipCues
        : h.caption
          ? [{ start: h.start, end: h.end, text: h.caption }]
          : [],
    };
  });

  return {
    id: `analysis_${ctx.videoId}_${Date.now()}`,
    configured: true,
    status: "completed",
    message: `AI menonton langsung isi video ini dan memilih ${clips.length} momen sesuai pengaturan kamu${
      ctx.transcript.length
        ? ` (dibantu transkrip asli ${ctx.transcript.length} baris${ctx.transcriptLanguage ? `, ${ctx.transcriptLanguage}` : ""})`
        : ""
    }.`,
    clips,
    videoTitle: ctx.title,
    transcriptAvailable: ctx.transcript.length > 0,
  };
}

async function providerFetch(
  config: ProviderConfig,
  path: string,
  init?: RequestInit,
) {
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

export async function fetchProviderJob(
  config: ProviderConfig,
  jobId: string,
): Promise<ClipJob> {
  const payload = await providerFetch(config, `/jobs/${encodeURIComponent(jobId)}`);
  return normalizeProviderJob(payload);
}

function normalizeProviderJob(
  payload: Record<string, unknown>,
  analysis?: ClipJob,
): ClipJob {
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

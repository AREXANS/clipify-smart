import type { ClipJob, ClipResult, ClipSettings } from "./clip-settings";

const HOOKS = [
  "Savage 5 kill beruntun",
  "Clutch 1v3 di lord pit",
  "Maniac dari jungler",
  "Comeback 10 detik terakhir",
  "Reaksi facecam paling kocak",
  "Turret dive nekat",
  "Steal lord tipis banget",
  "Baim pro player kena tipu",
  "Highlight late game war",
  "Momen paling toxic chat",
];

const REASONS = [
  "Lonjakan audio + banyak kill dalam 8 detik",
  "Ekspresi facecam sangat ekspresif",
  "Teamfight padat dengan 4 eliminasi",
  "Kata kunci hype terdeteksi di transkrip",
  "Perubahan momentum objektif (Lord)",
  "Puncak retensi berdasarkan tempo bicara",
];

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildDemoJobId(settings: ClipSettings) {
  const seed = hashString(settings.url + settings.layout + settings.aspectRatio);
  return `demo_${Date.now()}_${seed}_${settings.clipCount}_${settings.minDuration}_${settings.maxDuration}`;
}

export function buildDemoJob(jobId: string): ClipJob {
  const [, startedAtRaw, seedRaw, countRaw, minRaw, maxRaw] = jobId.split("_");
  const startedAt = Number(startedAtRaw);
  const seed = Number(seedRaw);
  const count = Math.max(1, Math.min(12, Number(countRaw) || 6));
  const min = Number(minRaw) || 20;
  const max = Math.max(min + 5, Number(maxRaw) || 60);

  const elapsed = (Date.now() - startedAt) / 1000;
  const clips: ClipResult[] = [];

  for (let i = 0; i < count; i++) {
    const r = (seed + i * 9973) % 1000;
    const duration = min + (r % Math.max(1, max - min));
    const start = 120 + i * 210 + (r % 90);
    // Setiap klip "selesai" bertahap agar progres terasa nyata.
    const clipStartDelay = 1.5 + i * 1.6;
    const clipProgress = Math.max(
      0,
      Math.min(100, Math.round(((elapsed - clipStartDelay) / 6) * 100)),
    );
    clips.push({
      id: `${jobId}-c${i}`,
      title: HOOKS[(seed + i) % HOOKS.length]!,
      startSeconds: start,
      endSeconds: start + duration,
      score: 72 + ((seed + i * 37) % 28),
      reason: REASONS[(seed + i * 3) % REASONS.length]!,
      status:
        clipProgress >= 100 ? "ready" : clipProgress <= 0 ? "queued" : "rendering",
      progress: clipProgress,
    });
  }

  const allReady = clips.every((c) => c.status === "ready");

  return {
    id: jobId,
    configured: false,
    status: allReady ? "completed" : "processing",
    message:
      "Mode pratinjau: analisis dan render sungguhan aktif setelah API pemrosesan video disambungkan.",
    clips,
  };
}

type ProviderConfig = { baseUrl: string; apiKey: string };

export function getProviderConfig(): ProviderConfig | null {
  const baseUrl = process.env["CLIPPER_API_URL"];
  const apiKey = process.env["CLIPPER_API_KEY"];
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
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
    throw new Error(`Layanan pemrosesan gagal [${res.status}]: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function createProviderJob(
  config: ProviderConfig,
  settings: ClipSettings,
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
    }),
  });
  return normalizeProviderJob(payload);
}

export async function fetchProviderJob(
  config: ProviderConfig,
  jobId: string,
): Promise<ClipJob> {
  const payload = await providerFetch(config, `/jobs/${encodeURIComponent(jobId)}`);
  return normalizeProviderJob(payload);
}

function normalizeProviderJob(payload: Record<string, unknown>): ClipJob {
  const rawClips = Array.isArray(payload["clips"]) ? payload["clips"] : [];
  const clips: ClipResult[] = rawClips.map((raw, i) => {
    const c = raw as Record<string, unknown>;
    return {
      id: String(c["id"] ?? `clip-${i}`),
      title: String(c["title"] ?? `Klip ${i + 1}`),
      startSeconds: Number(c["start"] ?? c["start_seconds"] ?? 0),
      endSeconds: Number(c["end"] ?? c["end_seconds"] ?? 0),
      score: Number(c["score"] ?? 0),
      reason: String(c["reason"] ?? ""),
      status: (c["status"] as ClipResult["status"]) ?? "queued",
      progress: Number(c["progress"] ?? 0),
      downloadUrl: (c["download_url"] as string | undefined) ?? undefined,
    };
  });

  return {
    id: String(payload["id"] ?? ""),
    configured: true,
    status: (payload["status"] as ClipJob["status"]) ?? "processing",
    message: (payload["message"] as string | undefined) ?? undefined,
    clips,
  };
}

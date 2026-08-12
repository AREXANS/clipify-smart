/**
 * Mengambil URL stream video YouTube yang bisa diputar langsung (progressive MP4),
 * agar klip bisa dirender tanpa mengunggah file. Streaming dilakukan lewat proxy
 * server dengan dukungan HTTP Range, jadi video sepanjang apa pun tetap bisa
 * di-seek ke rentang klip tanpa mengunduh seluruh file.
 */

export type ResolvedStream = {
  url: string;
  mimeType: string;
  height: number;
  contentLength?: number | undefined;
  title: string;
  durationSeconds: number;
};

type PlayerFormat = {
  itag: number;
  url?: string;
  mimeType: string;
  height?: number;
  width?: number;
  audioQuality?: string;
  contentLength?: string;
};

const cache = new Map<string, { value: ResolvedStream; expiresAt: number }>();

// Klien iOS masih melayani URL progressive tanpa verifikasi bot.
const CLIENT_CONTEXT = {
  client: {
    clientName: "IOS",
    clientVersion: "20.10.4",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    osName: "iPhone",
    osVersion: "18.3.2.22D82",
    hl: "id",
  },
};

const STREAM_UA =
  "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)";

async function requestPlayer(videoId: string) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": STREAM_UA,
    },
    body: JSON.stringify({
      videoId,
      context: CLIENT_CONTEXT,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tidak bisa membaca data video YouTube [${res.status}].`);
  }
  return (await res.json()) as {
    playabilityStatus?: { status?: string; reason?: string };
    videoDetails?: { title?: string; lengthSeconds?: string };
    streamingData?: { formats?: PlayerFormat[]; adaptiveFormats?: PlayerFormat[] };
  };
}

export async function resolveProgressiveStream(videoId: string): Promise<ResolvedStream> {
  const cached = cache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const data = await requestPlayer(videoId);
  const status = data.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(
      data.playabilityStatus?.reason ??
        "Video ini tidak bisa diputar publik (privat, dibatasi usia, atau dihapus).",
    );
  }

  const formats = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ].filter((f): f is PlayerFormat & { url: string } => Boolean(f.url));

  // Prioritas: MP4 muxed (ada audio) resolusi tertinggi, lalu MP4 video-only.
  const muxed = formats
    .filter((f) => f.mimeType.includes("video/mp4") && f.audioQuality)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const videoOnly = formats
    .filter((f) => f.mimeType.startsWith("video/mp4") && !f.audioQuality)
    .sort((a, b) => (a.height ?? 0) - (b.height ?? 0))
    .filter((f) => (f.height ?? 0) >= 480);

  const chosen = muxed[0] ?? videoOnly[0];
  if (!chosen) {
    throw new Error("Tidak ada stream MP4 yang bisa dipakai untuk video ini.");
  }

  const value: ResolvedStream = {
    url: chosen.url,
    mimeType: chosen.mimeType,
    height: chosen.height ?? 0,
    contentLength: chosen.contentLength ? Number(chosen.contentLength) : undefined,
    title: data.videoDetails?.title ?? "Video YouTube",
    durationSeconds: Number(data.videoDetails?.lengthSeconds ?? 0),
  };

  cache.set(videoId, { value, expiresAt: Date.now() + 3 * 60 * 1000 });
  return value;
}

/** Teruskan permintaan (termasuk Range) ke CDN YouTube dan alirkan hasilnya. */
export async function streamVideoRange(videoId: string, range: string | null) {
  let resolved = await resolveProgressiveStream(videoId);
  const doFetch = (url: string) =>
    fetch(url, {
      headers: {
        ...(range ? { Range: range } : {}),
        "User-Agent": STREAM_UA,
      },
    });

  let upstream = await doFetch(resolved.url);
  if (upstream.status === 403 || upstream.status === 401 || upstream.status === 410) {
    cache.delete(videoId);
    resolved = await resolveProgressiveStream(videoId);
    upstream = await doFetch(resolved.url);
  }

  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`Gagal mengalirkan video [${upstream.status}].`);
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? resolved.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=600",
  });
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(upstream.body, { status: upstream.status, headers });
}

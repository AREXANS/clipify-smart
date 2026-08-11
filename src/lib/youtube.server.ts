export type TranscriptCue = { start: number; end: number; text: string };

export type VideoContext = {
  videoId: string;
  title: string;
  author: string;
  description: string;
  durationSeconds: number;
  chapters: { start: number; title: string }[];
  transcript: TranscriptCue[];
  transcriptLanguage: string | null;
};

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/(?:live|shorts|embed)\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function unescapeJson(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

async function fetchWatchPage(videoId: string) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=id`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Tidak bisa membaca halaman YouTube [${res.status}].`);
  }
  return res.text();
}

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };

function pickTrack(tracks: CaptionTrack[], preferred: string): CaptionTrack | null {
  if (tracks.length === 0) return null;
  if (preferred !== "auto") {
    const exact = tracks.find((t) => t.languageCode.startsWith(preferred));
    if (exact) return exact;
  }
  return tracks[0] ?? null;
}

async function fetchTranscript(track: CaptionTrack): Promise<TranscriptCue[]> {
  const url = `${track.baseUrl.replace(/\\u0026/g, "&")}&fmt=json3`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
  };
  const cues: TranscriptCue[] = [];
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    cues.push({ start, end: start + (ev.dDurationMs ?? 3000) / 1000, text });
  }
  return cues;
}

function parseChapters(description: string) {
  const chapters: { start: number; title: string }[] = [];
  const re = /(?:^|\n)\s*(?:\(|\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\)|\])?\s*[-–—:]?\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description))) {
    const parts = m[1]!.split(":").map(Number);
    const seconds =
      parts.length === 3
        ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
        : parts[0]! * 60 + parts[1]!;
    chapters.push({ start: seconds, title: m[2]!.trim().slice(0, 120) });
  }
  return chapters.slice(0, 40);
}

export async function fetchVideoContext(
  url: string,
  preferredLanguage: string,
): Promise<VideoContext> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("URL YouTube tidak dikenali.");

  const html = await fetchWatchPage(videoId);

  if (/"status":"(LOGIN_REQUIRED|UNPLAYABLE|ERROR)"/.test(html)) {
    throw new Error(
      "Video ini tidak bisa diakses publik (privat, dibatasi usia, atau dihapus).",
    );
  }

  const title = unescapeJson(html.match(/"title":"(.*?)","lengthSeconds"/s)?.[1] ?? "");
  const author = unescapeJson(html.match(/"author":"(.*?)"/)?.[1] ?? "");
  const description = unescapeJson(
    html.match(/"shortDescription":"(.*?)","/s)?.[1] ?? "",
  );
  const durationSeconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0);

  let transcript: TranscriptCue[] = [];
  let transcriptLanguage: string | null = null;
  const capsRaw = html.match(/"captionTracks":(\[.*?\])/s)?.[1];
  if (capsRaw) {
    try {
      const tracks = JSON.parse(capsRaw.replace(/\\u0026/g, "&")) as CaptionTrack[];
      const track = pickTrack(tracks, preferredLanguage);
      if (track) {
        transcript = await fetchTranscript(track);
        transcriptLanguage = track.languageCode;
      }
    } catch {
      transcript = [];
    }
  }

  return {
    videoId,
    title: title || "Video YouTube",
    author,
    description,
    durationSeconds,
    chapters: parseChapters(description),
    transcript,
    transcriptLanguage,
  };
}

/** Ringkas transkrip menjadi blok waktu agar muat di context window model. */
export function condenseTranscript(cues: TranscriptCue[], bucketSeconds = 20) {
  const buckets = new Map<number, string[]>();
  for (const cue of cues) {
    const key = Math.floor(cue.start / bucketSeconds) * bucketSeconds;
    const list = buckets.get(key) ?? [];
    list.push(cue.text);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, texts]) => `[${start}s] ${texts.join(" ").slice(0, 400)}`);
}

export function cuesBetween(cues: TranscriptCue[], start: number, end: number) {
  return cues.filter((c) => c.end > start && c.start < end);
}

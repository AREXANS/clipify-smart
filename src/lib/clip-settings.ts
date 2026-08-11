export const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16", hint: "TikTok / Reels / Shorts" },
  { value: "1:1", label: "1:1", hint: "Feed persegi" },
  { value: "4:5", label: "4:5", hint: "Instagram potret" },
  { value: "16:9", label: "16:9", hint: "YouTube landscape" },
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export const LAYOUT_MODES = [
  {
    value: "auto",
    label: "Auto reframe",
    desc: "AI mengikuti subjek utama di tengah frame.",
  },
  {
    value: "split",
    label: "Split facecam + gameplay",
    desc: "Deteksi wajah streamer dan area gameplay Mobile Legends, lalu susun bertumpuk.",
  },
  {
    value: "gameplay",
    label: "Gameplay saja",
    desc: "Crop hanya area gameplay, facecam dibuang.",
  },
] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number]["value"];

export const SUBTITLE_STYLES = [
  {
    value: "karaoke",
    label: "Karaoke word-pop",
    desc: "Kata aktif menyala kuning, per kata muncul mengikuti suara.",
  },
  {
    value: "bold",
    label: "Bold caption",
    desc: "Huruf kapital tebal dengan outline hitam, gaya viral TikTok.",
  },
  {
    value: "minimal",
    label: "Minimal clean",
    desc: "Teks putih rapi di atas bilah gelap transparan.",
  },
] as const;

export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number]["value"];

export const FACECAM_SOURCE_OPTIONS = [
  { value: "top-left", label: "Kotak kiri atas" },
  { value: "top-right", label: "Kotak kanan atas" },
  { value: "bottom-left", label: "Kotak kiri bawah" },
  { value: "bottom-right", label: "Kotak kanan bawah" },
  { value: "full", label: "Seluruh frame (kamera penuh)" },
] as const;

export type FacecamSource = (typeof FACECAM_SOURCE_OPTIONS)[number]["value"];

export type ClipSettings = {
  url: string;
  aspectRatio: AspectRatio;
  layout: LayoutMode;
  facecamShare: number; // % tinggi frame untuk facecam saat layout split
  facecamSource: FacecamSource; // posisi kamera streamer di video sumber
  subtitles: boolean;
  subtitleStyle: SubtitleStyle;
  subtitleLanguage: string;
  clipCount: number;
  minDuration: number;
  maxDuration: number;
  addHook: boolean;
  removeSilence: boolean;
  highlightKills: boolean;
  useAi: boolean;
};

export const DEFAULT_SETTINGS: ClipSettings = {
  url: "",
  aspectRatio: "9:16",
  layout: "split",
  facecamShare: 50,
  facecamSource: "top-left",
  subtitles: true,
  subtitleStyle: "karaoke",
  subtitleLanguage: "id",
  clipCount: 6,
  minDuration: 20,
  maxDuration: 60,
  addHook: true,
  removeSilence: true,
  highlightKills: true,
  useAi: true,
};

export type SubtitleCue = { start: number; end: number; text: string };

export type ClipResult = {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  score: number;
  reason: string;
  status: "queued" | "rendering" | "ready" | "failed";
  progress: number;
  downloadUrl?: string | undefined;
  videoId?: string | undefined;
  previewUrl?: string | undefined;
  subtitleLines?: string[] | undefined;
  subtitleCues?: SubtitleCue[] | undefined;
};

export type ClipJob = {
  id: string;
  configured: boolean;
  status: "queued" | "processing" | "completed" | "failed";
  message?: string | undefined;
  clips: ClipResult[];
  videoTitle?: string | undefined;
  transcriptAvailable?: boolean | undefined;
};

const YT_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
  /^https?:\/\/(www\.)?youtube\.com\/live\/[\w-]{11}/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]{11}/,
  /^https?:\/\/youtu\.be\/[\w-]{11}/,
];

export function isValidYoutubeUrl(url: string) {
  const trimmed = url.trim();
  return YT_PATTERNS.some((p) => p.test(trimmed));
}

export function formatTimecode(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

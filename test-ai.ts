import { selectHighlightsAI } from "./src/lib/highlight-ai.server";
import type { ClipSettings } from "./src/lib/clip-settings";
import type { VideoContext } from "./src/lib/youtube.server";

const ctx: VideoContext = {
  videoId: "test",
  title: "Mobile Legends Best Moments",
  author: "ML Tester",
  description: "Compilation of savage and clutch plays.",
  durationSeconds: 600,
  chapters: [
    { start: 0, title: "Intro" },
    { start: 120, title: "Early game fights" },
    { start: 300, title: "Mid game war" },
    { start: 480, title: "Late game clutch" },
  ],
  transcript: [
    { start: 0, end: 12, text: "Halo guys balik lagi kita main Mobile Legends" },
    { start: 45, end: 58, text: "Wah musuhnya agresif banget di lane atas" },
    { start: 125, end: 145, text: "War war war! Ayo lord turtle! Triple kill! Savage!" },
    { start: 180, end: 200, text: "Clutch banget sih ulti dari mage kita" },
    { start: 310, end: 340, text: "Push push push! Tower lord! Menang! Gila epic comeback" },
    { start: 490, end: 520, text: "One shot one kill! Maniac! Anjir parah banget" },
    { start: 550, end: 600, text: "GGWP thanks for watching jangan lupa subscribe" },
  ],
  transcriptLanguage: "id",
};

const settings: ClipSettings = {
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  aspectRatio: "9:16",
  layout: "split",
  facecamShare: 50,
  facecamSource: "top-left",
  subtitles: true,
  subtitleStyle: "karaoke",
  subtitleLanguage: "id",
  clipCount: 3,
  minDuration: 20,
  maxDuration: 45,
  addHook: true,
  removeSilence: true,
  highlightKills: true,
  useAi: true,
};

const result = await selectHighlightsAI(ctx, settings);
console.log(JSON.stringify(result, null, 2));

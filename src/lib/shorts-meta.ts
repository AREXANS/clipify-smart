/** Judul, caption, dan hashtag siap upload Shorts/Reels/TikTok. */
export type ShortsMeta = {
  shortsTitle: string;
  caption: string;
  hashtags: string[];
};

const BASE_TAGS = ["#shorts", "#mobilelegends", "#mlbb", "#gaming", "#clip", "#viral", "#fyp"];

const KEYWORD_TAGS: Array<{ test: RegExp; tags: string[] }> = [
  { test: /savage/i, tags: ["#savage", "#savagemoment"] },
  { test: /maniac/i, tags: ["#maniac"] },
  { test: /(triple|double)\s*kill/i, tags: ["#multikill"] },
  { test: /clutch|comeback/i, tags: ["#clutch", "#comeback"] },
  { test: /war|teamfight/i, tags: ["#teamfight"] },
  { test: /(lucu|kocak|ngakak)/i, tags: ["#lucu", "#ngakak"] },
  { test: /(tips|tutorial|build)/i, tags: ["#tipsmlbb", "#buildmlbb"] },
  { test: /rank|mythic|legend/i, tags: ["#rankedgame", "#mythic"] },
];

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function titleCase(text: string) {
  return clean(text).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

/** Susun metadata upload dari judul klip, alasan AI, dan transkrip klip. */
export function buildShortsMeta(input: {
  clipTitle: string;
  reason?: string | undefined;
  videoTitle?: string | undefined;
  lines?: string[] | undefined;
  durationSeconds: number;
}): ShortsMeta {
  // Use the actual clip title as the hook, or "Momen seru" as fallback.
  // We do not force titleCase because AI-generated titles may already have specific formatting.
  const hook = clean(input.clipTitle || "Momen seru");
  const source = clean(input.videoTitle ?? "");
  const quote = clean((input.lines ?? []).slice(0, 3).join(" ")).slice(0, 180);

  const shortsTitle = clean(`${hook} 🔥 ${Math.round(input.durationSeconds)}s #shorts`).slice(
    0,
    95,
  );

  const captionParts = [
    hook.toUpperCase(),
    quote ? `"${quote}"` : clean(input.reason ?? ""),
    source ? `Sumber: ${source}` : "",
    "Tonton sampai habis, komen momen favoritmu 👇",
  ].filter(Boolean);

  const pool = `${hook} ${input.reason ?? ""} ${source} ${quote}`;
  const extra = KEYWORD_TAGS.filter((k) => k.test.test(pool)).flatMap((k) => k.tags);
  const hashtags = Array.from(new Set([...extra, ...BASE_TAGS])).slice(0, 12);

  return {
    shortsTitle,
    caption: captionParts.join("\n\n"),
    hashtags,
  };
}

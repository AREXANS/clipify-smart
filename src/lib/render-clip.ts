import type {
  AspectRatio,
  ClipResult,
  ClipSettings,
  SubtitleCue,
  SubtitleStyle,
} from "@/lib/clip-settings";

/** Ukuran render keluaran per rasio. */
export const OUTPUT_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 864, h: 1080 },
  "16:9": { w: 1280, h: 720 },
};

export type Rect = { x: number; y: number; w: number; h: number };

/** Area sumber facecam pada video asli (fraksi 0–1). */
export const FACECAM_SOURCES: Record<ClipSettings["facecamSource"], Rect> = {
  auto: { x: 0, y: 0, w: 0.3, h: 0.36 },
  "top-left": { x: 0, y: 0, w: 0.3, h: 0.36 },
  "top-right": { x: 0.7, y: 0, w: 0.3, h: 0.36 },
  "bottom-left": { x: 0, y: 0.64, w: 0.3, h: 0.36 },
  "bottom-right": { x: 0.7, y: 0.64, w: 0.3, h: 0.36 },
  full: { x: 0, y: 0, w: 1, h: 1 },
};

/**
 * Area facecam final: preset/deteksi otomatis lalu diberi zoom manual dan
 * geseran halus sesuai pengaturan pengguna.
 *
 * `targetAspect` (lebar/tinggi panel keluaran) dan `sourceAspect` (lebar/tinggi
 * video sumber) dipakai agar kotak sumber punya rasio sama dengan panel tujuan,
 * sehingga tidak ada bagian facecam yang terpotong saat digambar.
 */
export function resolveFacecamRect(
  settings: ClipSettings,
  autoRect?: Rect | null,
  fit?: { targetAspect: number; sourceAspect: number },
): Rect {
  const base =
    settings.facecamSource === "auto"
      ? (autoRect ?? FACECAM_SOURCES.auto)
      : (FACECAM_SOURCES[settings.facecamSource] ?? FACECAM_SOURCES.full);

  const zoom = Math.max(0.6, (settings.facecamZoom ?? 100) / 100);
  let w = Math.min(1, Math.max(0.05, base.w / zoom));
  let h = Math.min(1, Math.max(0.05, base.h / zoom));

  if (fit && fit.targetAspect > 0 && fit.sourceAspect > 0) {
    // Rasio kotak dalam piksel sumber.
    const rectAspect = (w * fit.sourceAspect) / h;
    if (rectAspect < fit.targetAspect) {
      w = Math.min(1, (h * fit.targetAspect) / fit.sourceAspect);
      h = Math.min(1, (w * fit.sourceAspect) / fit.targetAspect);
    } else if (rectAspect > fit.targetAspect) {
      h = Math.min(1, (w * fit.sourceAspect) / fit.targetAspect);
      w = Math.min(1, (h * fit.targetAspect) / fit.sourceAspect);
    }
  }

  const cx = base.x + base.w / 2 + (settings.facecamOffsetX ?? 0) / 100;
  const cy = base.y + base.h / 2 + (settings.facecamOffsetY ?? 0) / 100;

  return {
    x: Math.min(1 - w, Math.max(0, cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, cy - h / 2)),
    w,
    h,
  };
}


/** Gambar potongan sumber ke tujuan dengan mode cover (tanpa distorsi). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dims: { width: number; height: number },
  src: Rect,
  dest: Rect,
) {
  const sx = src.x * dims.width;
  const sy = src.y * dims.height;
  const sw = Math.max(1, src.w * dims.width);
  const sh = Math.max(1, src.h * dims.height);


  const scale = Math.max(dest.w / sw, dest.h / sh);
  const cw = dest.w / scale;
  const ch = dest.h / scale;
  const cx = sx + (sw - cw) / 2;
  const cy = sy + (sh - ch) / 2;

  ctx.drawImage(video, cx, cy, cw, ch, dest.x, dest.y, dest.w, dest.h);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const candidate = [...current, word].join(" ");
    if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  style: SubtitleStyle,
  text: string,
  progress: number,
  W: number,
  H: number,
) {
  const fontSize = Math.round(W * 0.062);
  const lineHeight = fontSize * 1.22;
  const maxWidth = W * 0.86;

  ctx.textBaseline = "middle";
  ctx.font =
    style === "minimal"
      ? `500 ${fontSize}px system-ui, sans-serif`
      : `900 ${fontSize}px system-ui, sans-serif`;

  const raw = style === "minimal" ? text : text.toUpperCase();
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const lines = wrapLines(ctx, words, maxWidth);
  const totalHeight = lines.length * lineHeight;
  const baseY = H * 0.9 - totalHeight + lineHeight / 2;
  const activeIndex = Math.min(
    words.length - 1,
    Math.floor(progress * words.length),
  );

  let wordIndex = 0;
  lines.forEach((line, li) => {
    const y = baseY + li * lineHeight;
    const lineText = line.join(" ");
    const lineWidth = ctx.measureText(lineText).width;
    let x = (W - lineWidth) / 2;

    if (style === "minimal") {
      const padX = fontSize * 0.4;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(
        x - padX,
        y - lineHeight / 2,
        lineWidth + padX * 2,
        lineHeight,
      );
      ctx.fillStyle = "#ffffff";
      ctx.fillText(lineText, x, y);
      wordIndex += line.length;
      return;
    }

    const spaceWidth = ctx.measureText(" ").width;
    for (const word of line) {
      const w = ctx.measureText(word).width;
      const isActive = style === "karaoke" && wordIndex === activeIndex;
      ctx.lineWidth = Math.max(4, fontSize * 0.16);
      ctx.strokeStyle = "#000000";
      ctx.lineJoin = "round";
      ctx.strokeText(word, x, y);
      ctx.fillStyle = isActive ? "#ffd93d" : "#ffffff";
      ctx.fillText(word, x, y);
      x += w + spaceWidth;
      wordIndex += 1;
    }
  });
}

function drawHook(
  ctx: CanvasRenderingContext2D,
  title: string,
  opacity: number,
  W: number,
) {
  const fontSize = Math.round(W * 0.058);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const lines = wrapLines(ctx, title.toUpperCase().split(/\s+/), W * 0.84);
  lines.forEach((line, i) => {
    const text = line.join(" ");
    const width = ctx.measureText(text).width;
    const x = (W - width) / 2;
    const y = W * 0.12 + i * fontSize * 1.2;
    ctx.lineWidth = Math.max(4, fontSize * 0.16);
    ctx.strokeStyle = "#000000";
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  });
  ctx.restore();
}

export type FrameContext = {
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  settings: ClipSettings;
  clip: ClipResult;
  /** Detik relatif terhadap awal klip. */
  elapsed: number;
  /** Kotak facecam hasil deteksi otomatis (fraksi 0–1), menimpa preset. */
  facecamRect?: Rect | null | undefined;
};

/** Satu frame klip jadi: crop rasio, split facecam, subtitle, hook. */
export function drawClipFrame({
  ctx,
  video,
  settings,
  clip,
  elapsed,
  facecamRect,
}: FrameContext) {
  const { w: W, h: H } = OUTPUT_SIZE[settings.aspectRatio];
  const dims = {
    width: video.videoWidth || 16,
    height: video.videoHeight || 9,
  };

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

  if (settings.layout === "split") {
    const topH = Math.round((H * settings.facecamShare) / 100);
    const face = resolveFacecamRect(settings, facecamRect ?? null);
    drawCover(ctx, video, dims, face, { x: 0, y: 0, w: W, h: topH });
    drawCover(ctx, video, dims, FULL, { x: 0, y: topH, w: W, h: H - topH });
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, topH - 2, W, 4);
  } else if (settings.layout === "gameplay") {
    // Buang area facecam: crop bagian tengah-bawah gameplay
    drawCover(ctx, video, dims, { x: 0.08, y: 0.1, w: 0.84, h: 0.9 }, {
      x: 0,
      y: 0,
      w: W,
      h: H,
    });
  } else {
    drawCover(ctx, video, dims, FULL, { x: 0, y: 0, w: W, h: H });
  }


  if (settings.addHook && elapsed < 3.5) {
    const opacity =
      elapsed < 0.3 ? elapsed / 0.3 : elapsed > 2.8 ? Math.max(0, 1 - (elapsed - 2.8) / 0.7) : 1;
    drawHook(ctx, clip.title, opacity, W);
  }

  if (settings.subtitles) {
    const cues: SubtitleCue[] = (clip.subtitleCues ?? []).map((c) => ({
      start: c.start - clip.startSeconds,
      end: c.end - clip.startSeconds,
      text: c.text,
    }));
    const cue = cues.find((c) => elapsed >= c.start && elapsed < c.end);
    const text = cue?.text ?? (cues.length === 0 ? clip.subtitleLines?.[0] : undefined);
    if (text) {
      const progress = cue
        ? Math.min(1, Math.max(0, (elapsed - cue.start) / Math.max(0.2, cue.end - cue.start)))
        : 0;
      drawSubtitle(ctx, settings.subtitleStyle, text, progress, W, H);
    }
  }
}

function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export type RenderedClip = { blob: Blob; url: string; extension: string };

/**
 * Render klip sungguhan dari file video sumber: hasilkan file video baru yang
 * sudah dipotong, di-crop, di-split, dan diberi subtitle — siap diunduh.
 */
export async function renderClipToFile(options: {
  sourceUrl: string;
  clip: ClipResult;
  settings: ClipSettings;
  facecamRect?: Rect | null | undefined;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}): Promise<RenderedClip> {
  const { sourceUrl, clip, settings, onProgress, signal } = options;
  const { w: W, h: H } = OUTPUT_SIZE[settings.aspectRatio];

  const video = document.createElement("video");
  video.src = sourceUrl;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  video.muted = false;
  video.volume = 1;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Video sumber tidak bisa dibaca."));
  });

  const duration = Math.max(1, clip.endSeconds - clip.startSeconds);
  if (video.duration && clip.startSeconds >= video.duration) {
    throw new Error(
      "Momen klip berada di luar durasi video sumber. Pastikan file yang diunggah sama dengan video YouTube-nya.",
    );
  }

  // Deteksi facecam dari frame video sungguhan (bukan thumbnail).
  let faceRect = options.facecamRect ?? null;
  if (settings.layout === "split" && settings.facecamSource === "auto" && !faceRect) {
    const { detectFacecamRect } = await import("@/lib/facecam-detect");
    faceRect = await detectFacecamRect({
      video,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    }).catch(() => null);
  }

  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = clip.startSeconds;
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");

  const stream = canvas.captureStream(30);

  // Audio asli video ikut direkam.
  let audioCtx: AudioContext | null = null;
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtor) {
      audioCtx = new AudioCtor();
      const srcNode = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      srcNode.connect(dest);
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    }
  } catch {
    audioCtx = null;
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(200);
  await video.play();

  await new Promise<void>((resolve) => {
    let raf = 0;
    const tick = () => {
      const elapsed = video.currentTime - clip.startSeconds;
      drawClipFrame({ ctx, video, settings, clip, elapsed, facecamRect: faceRect });
      onProgress?.(Math.min(1, Math.max(0, elapsed / duration)));
      if (signal?.aborted || elapsed >= duration || video.ended) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  video.pause();
  recorder.stop();
  const blob = await finished;
  for (const track of stream.getTracks()) track.stop();
  await audioCtx?.close().catch(() => undefined);

  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return { blob, url: URL.createObjectURL(blob), extension };
}

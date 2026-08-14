import type { Rect } from "@/lib/render-clip";

/**
 * Deteksi otomatis kotak facecam (wajah streamer) di video sumber.
 * Memakai FaceDetector native bila tersedia, kalau tidak memakai heuristik
 * kepadatan warna kulit pada kandidat kotak di tiap sudut frame.
 */

type FaceBox = { x: number; y: number; width: number; height: number };

type FaceDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ boundingBox: FaceBox }[]>;
};

const SAMPLE_W = 320;

function isSkin(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;
}

const CANDIDATES: Rect[] = [
  { x: 0, y: 0, w: 0.3, h: 0.36 },
  { x: 0.7, y: 0, w: 0.3, h: 0.36 },
  { x: 0, y: 0.64, w: 0.3, h: 0.36 },
  { x: 0.7, y: 0.64, w: 0.3, h: 0.36 },
  { x: 0, y: 0, w: 0.22, h: 0.28 },
  { x: 0.78, y: 0, w: 0.22, h: 0.28 },
  { x: 0, y: 0.72, w: 0.22, h: 0.28 },
  { x: 0.78, y: 0.72, w: 0.22, h: 0.28 },
];

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
    // Jangan menggantung bila browser tidak memicu event.
    setTimeout(done, 1200);
  });
}

/** Kotak facecam dari satu frame, atau null bila tidak ada wajah terdeteksi. */
async function detectFromFrame(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): Promise<Rect | null> {
  ctx.drawImage(video, 0, 0, W, H);

  const Ctor = (window as unknown as { FaceDetector?: new (o?: unknown) => FaceDetectorLike })
    .FaceDetector;
  if (Ctor) {
    try {
      const faces = await new Ctor({ fastMode: true, maxDetectedFaces: 5 }).detect(ctx.canvas);
      const face = faces
        .map((f) => f.boundingBox)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (face) {
        // Perluas kotak wajah menjadi area facecam (kepala + bahu).
        const cx = (face.x + face.width / 2) / W;
        const cy = (face.y + face.height / 2) / H;
        const w = Math.min(0.42, Math.max(0.18, (face.width / W) * 2.4));
        const h = Math.min(0.52, Math.max(0.24, (face.height / H) * 2.4));
        return {
          x: Math.min(1 - w, Math.max(0, cx - w / 2)),
          y: Math.min(1 - h, Math.max(0, cy - h / 2)),
          w,
          h,
        };
      }
    } catch {
      // lanjut ke heuristik
    }
  }

  const { data } = ctx.getImageData(0, 0, W, H);
  let best: { rect: Rect; score: number } | null = null;
  for (const rect of CANDIDATES) {
    const x0 = Math.floor(rect.x * W);
    const y0 = Math.floor(rect.y * H);
    const x1 = Math.min(W, Math.ceil((rect.x + rect.w) * W));
    const y1 = Math.min(H, Math.ceil((rect.y + rect.h) * H));
    let skin = 0;
    let total = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * W + x) * 4;
        total += 1;
        if (isSkin(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) skin += 1;
      }
    }
    const score = total > 0 ? skin / total : 0;
    if (!best || score > best.score) best = { rect, score };
  }
  if (best && best.score > 0.06) return best.rect;
  return null;
}

/**
 * Sampling beberapa frame dalam rentang klip lalu pilih kotak facecam terbaik.
 * Mengembalikan null bila tidak ada indikasi facecam.
 */
export async function detectFacecamRect(options: {
  video: HTMLVideoElement;
  startSeconds: number;
  endSeconds: number;
  samples?: number;
}): Promise<Rect | null> {
  const { video, startSeconds, endSeconds, samples = 3 } = options;
  if (!video.videoWidth || !video.videoHeight) return null;

  const W = SAMPLE_W;
  const H = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * SAMPLE_W));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const span = Math.max(0.5, endSeconds - startSeconds);
  const found: Rect[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = startSeconds + (span * (i + 0.5)) / samples;
    await seek(video, Math.max(0, Math.min(video.duration - 0.1 || t, t)));
    const rect = await detectFromFrame(video, ctx, W, H);
    if (rect) found.push(rect);
  }
  if (found.length === 0) return null;

  // Rata-ratakan hasil agar stabil antar frame.
  const avg = found.reduce(
    (acc, r) => ({
      x: acc.x + r.x / found.length,
      y: acc.y + r.y / found.length,
      w: acc.w + r.w / found.length,
      h: acc.h + r.h / found.length,
    }),
    { x: 0, y: 0, w: 0, h: 0 },
  );
  return avg;
}

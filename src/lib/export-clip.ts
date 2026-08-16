import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { ClipResult, ClipSettings } from "@/lib/clip-settings";
import { OUTPUT_SIZE, drawClipFrame, type Rect } from "@/lib/render-clip";

export type ExportedClip = { blob: Blob; url: string; extension: string };

const FPS = 30;

export function canExportDirect() {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder !== "undefined" &&
    typeof window.VideoFrame !== "undefined"
  );
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
    // Jaring aman jika browser tidak memicu seeked.
    setTimeout(done, 2500);
  });
}

async function decodeAudioSlice(
  sourceUrl: string,
  start: number,
  duration: number,
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    const ctx = new AudioCtor();
    const decoded = await ctx.decodeAudioData(bytes);
    const rate = decoded.sampleRate;
    const from = Math.floor(start * rate);
    const length = Math.min(
      Math.floor(duration * rate),
      Math.max(0, decoded.length - from),
    );
    if (length <= 0) {
      await ctx.close();
      return null;
    }
    const out = ctx.createBuffer(decoded.numberOfChannels, length, rate);
    for (let c = 0; c < decoded.numberOfChannels; c += 1) {
      out.copyToChannel(decoded.getChannelData(c).slice(from, from + length), c);
    }
    await ctx.close();
    return out;
  } catch {
    return null;
  }
}

/**
 * Ekspor klip langsung (bukan rekam ulang realtime): setiap frame di-seek,
 * digambar sesuai pengaturan edit, lalu di-encode ke MP4 dengan WebCodecs.
 */
export async function exportClipDirect(options: {
  sourceUrl: string;
  clip: ClipResult;
  settings: ClipSettings;
  facecamRect?: Rect | null | undefined;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}): Promise<ExportedClip> {
  const { sourceUrl, clip, settings, onProgress, signal } = options;
  const { w: W, h: H } = OUTPUT_SIZE[settings.aspectRatio];
  const duration = Math.max(1, clip.endSeconds - clip.startSeconds);

  const video = document.createElement("video");
  video.src = sourceUrl;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Video sumber tidak bisa dibaca."));
  });

  if (video.duration && clip.startSeconds >= video.duration) {
    throw new Error("Momen klip berada di luar durasi video sumber.");
  }

  let faceRect = options.facecamRect ?? null;
  if (settings.layout === "split" && settings.facecamSource === "auto" && !faceRect) {
    const { detectFacecamRect } = await import("@/lib/facecam-detect");
    faceRect = await detectFacecamRect({
      video,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    }).catch(() => null);
  }

  const audio = await decodeAudioSlice(sourceUrl, clip.startSeconds, duration);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width: W, height: H },
    ...(audio
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: Math.min(2, audio.numberOfChannels),
            sampleRate: audio.sampleRate,
          },
        }
      : {}),
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });
  videoEncoder.configure({
    codec: "avc1.42002A",
    width: W,
    height: H,
    bitrate: 6_000_000,
    framerate: FPS,
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");

  const totalFrames = Math.round(duration * FPS);
  const hasFrameCallback =
    typeof (video as unknown as { requestVideoFrameCallback?: unknown })
      .requestVideoFrameCallback === "function";

  const encodeFrame = (index: number) => {
    const elapsed = index / FPS;
    drawClipFrame({ ctx, video, settings, clip, elapsed, facecamRect: faceRect });
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(elapsed * 1_000_000),
      duration: Math.round(1_000_000 / FPS),
    });
    videoEncoder.encode(frame, { keyFrame: index % (FPS * 2) === 0 });
    frame.close();
    onProgress?.(Math.min(0.95, (index + 1) / totalFrames));
  };

  if (hasFrameCallback) {
    // Jalur cepat: putar video (dipercepat & tanpa suara) lalu tangkap setiap
    // frame saat dirender browser — jauh lebih cepat daripada seek per frame.
    await seek(video, clip.startSeconds);
    video.playbackRate = 4;
    await video.play().catch(() => undefined);

    await new Promise<void>((resolve) => {
      let next = 0;
      const step = () => {
        if (signal?.aborted || next >= totalFrames || video.ended) {
          resolve();
          return;
        }
        const rel = video.currentTime - clip.startSeconds;
        if (rel >= duration) {
          resolve();
          return;
        }
        const target = Math.min(totalFrames - 1, Math.floor(rel * FPS));
        while (next <= target) {
          encodeFrame(next);
          next += 1;
        }
        if (videoEncoder.encodeQueueSize > 30) {
          void videoEncoder.flush().then(() => {
            (video as unknown as {
              requestVideoFrameCallback: (cb: () => void) => number;
            }).requestVideoFrameCallback(step);
          });
          return;
        }
        (video as unknown as {
          requestVideoFrameCallback: (cb: () => void) => number;
        }).requestVideoFrameCallback(step);
      };
      (video as unknown as {
        requestVideoFrameCallback: (cb: () => void) => number;
      }).requestVideoFrameCallback(step);
    });
    video.pause();
  } else {
    for (let i = 0; i < totalFrames; i += 1) {
      if (signal?.aborted) break;
      await seek(video, clip.startSeconds + i / FPS);
      encodeFrame(i);
      if (videoEncoder.encodeQueueSize > 8) {
        await videoEncoder.flush();
      }
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();


  if (audio && typeof window.AudioEncoder !== "undefined") {
    const channels = Math.min(2, audio.numberOfChannels);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: () => undefined,
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: channels,
      sampleRate: audio.sampleRate,
      bitrate: 128_000,
    });

    const block = 1024;
    const interleaved = new Float32Array(block * channels);
    for (let offset = 0; offset < audio.length; offset += block) {
      const count = Math.min(block, audio.length - offset);
      for (let c = 0; c < channels; c += 1) {
        const data = audio.getChannelData(c);
        for (let s = 0; s < count; s += 1) {
          interleaved[s * channels + c] = data[offset + s] ?? 0;
        }
      }
      const data = new AudioData({
        format: "f32",
        sampleRate: audio.sampleRate,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((offset / audio.sampleRate) * 1_000_000),
        data: interleaved.slice(0, count * channels),
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  muxer.finalize();
  onProgress?.(1);
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  return { blob, url: URL.createObjectURL(blob), extension: "mp4" };
}

import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, Play, Square } from "lucide-react";
import type { ClipResult, ClipSettings } from "@/lib/clip-settings";
import { formatTimecode } from "@/lib/clip-settings";
import { OUTPUT_SIZE, drawClipFrame, renderClipToFile, type Rect } from "@/lib/render-clip";
import { detectFacecamRect } from "@/lib/facecam-detect";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "clip"
  );
}

/**
 * Pratinjau hasil edit sungguhan (bukan iframe YouTube): frame digambar ulang
 * ke canvas dengan crop rasio, split facecam, dan subtitle terbakar.
 */
export function ClipRender({
  clip,
  settings,
  sourceUrl,
  index,
}: {
  clip: ClipResult;
  settings: ClipSettings;
  sourceUrl: string;
  index: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [facecamRect, setFacecamRect] = useState<Rect | null>(null);
  const facecamRef = useRef<Rect | null>(null);
  const [output, setOutput] = useState<{ url: string; extension: string; size: number } | null>(
    null,
  );

  // Clear the output (download button) when the clip boundaries are changed
  useEffect(() => {
    setOutput(null);
  }, [clip.startSeconds, clip.endSeconds]);

  const duration = Math.max(1, clip.endSeconds - clip.startSeconds);
  const size = OUTPUT_SIZE[settings.aspectRatio];

  facecamRef.current = facecamRect;

  // Deteksi kotak facecam dari frame video sungguhan (bukan thumbnail YouTube).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (settings.layout !== "split" || settings.facecamSource !== "auto") {
      setFacecamRect(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!video.videoWidth) {
        await new Promise<void>((resolve) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }
      if (cancelled) return;
      const rect = await detectFacecamRect({
        video,
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
      }).catch(() => null);
      if (!cancelled) setFacecamRect(rect);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, settings.layout, settings.facecamSource, clip.startSeconds, clip.endSeconds]);

  // Frame statis awal klip agar kartu tidak kosong.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const onSeeked = () => {
      if (!playing && !rendering) {
        drawClipFrame({
          ctx,
          video,
          settings,
          clip,
          elapsed: 0,
          facecamRect: facecamRef.current,
        });
      }
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = clip.startSeconds + 0.05;
    return () => video.removeEventListener("seeked", onSeeked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, settings, clip.id, playing, rendering, facecamRect]);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = clip.startSeconds + 0.05;
    }
    setPlaying(false);
    setElapsed(0);
  };

  const play = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    video.currentTime = clip.startSeconds;
    video.muted = false;
    await video.play().catch(() => undefined);
    setPlaying(true);
    const tick = () => {
      const rel = video.currentTime - clip.startSeconds;
      setElapsed(rel);
      drawClipFrame({ ctx, video, settings, clip, elapsed: rel, facecamRect });
      if (rel >= duration || video.ended) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleRender = async () => {
    if (rendering) return;
    stop();
    setRendering(true);
    setRenderProgress(0);
    try {
      const result = await renderClipToFile({
        sourceUrl,
        clip,
        settings,
        facecamRect,
        onProgress: setRenderProgress,
      });
      setOutput({ url: result.url, extension: result.extension, size: result.blob.size });
      toast.success("Klip selesai dirender", {
        description: `Ukuran ${(result.blob.size / 1_000_000).toFixed(1)} MB — siap diunduh.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Render gagal.");
    } finally {
      setRendering(false);
    }
  };

  const fileName = `${String(index + 1).padStart(2, "0")}-${slugify(clip.title)}.${output?.extension ?? "mp4"}`;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-background">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          className="block h-auto w-full"
          aria-label={`Pratinjau hasil edit klip ${clip.title}`}
        />
        <video ref={videoRef} src={sourceUrl} preload="auto" playsInline className="hidden" />

        {!playing && !rendering ? (
          <button
            type="button"
            onClick={() => void play()}
            aria-label={`Putar pratinjau ${clip.title}`}
            className="absolute inset-0 flex items-center justify-center bg-background/25"
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-primary/60 bg-background/75 text-primary glow-ring transition-transform hover:scale-110">
              <Play className="size-5" />
            </span>
          </button>
        ) : null}

        {playing ? (
          <>
            <span className="font-display absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] tracking-wider">
              {formatTimecode(elapsed)} / {formatTimecode(duration)}
            </span>
            <button
              type="button"
              onClick={stop}
              aria-label="Hentikan pratinjau"
              className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80"
            >
              <Square className="size-3.5" />
            </button>
          </>
        ) : null}

        {rendering ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="font-display text-sm tracking-widest uppercase">Merender</p>
            <p className="px-6 text-sm text-muted-foreground">
              Jangan tutup tab ini — klip direkam secara real-time.
            </p>
          </div>
        ) : null}
      </div>

      {rendering ? <Progress value={renderProgress * 100} className="h-1" /> : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={output ? "outline" : "default"}
          className="flex-1"
          onClick={() => void handleRender()}
          disabled={rendering}
        >
          {rendering ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}
          {output ? "Render ulang" : "Render klip"}
        </Button>
        {output ? (
          <Button size="sm" className="flex-1" asChild>
            <a href={output.url} download={fileName}>
              <Download className="size-4" /> Unduh
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

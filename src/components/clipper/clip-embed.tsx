import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { formatTimecode, type ClipResult, type ClipSettings } from "@/lib/clip-settings";
import { FACECAM_SOURCES, resolveFacecamRect, type Rect } from "@/lib/render-clip";
import { SubtitleText } from "@/components/clipper/subtitle-preview";

const RATIO_VALUE: Record<ClipSettings["aspectRatio"], number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
  "16:9": 16 / 9,
};

/** Area gameplay pada video sumber (fraksi 0–1) mengikuti posisi facecam. */
function gameplayRect(settings: ClipSettings): Rect {
  if (settings.layout === "auto") return { x: 0.18, y: 0.05, w: 0.64, h: 0.9 };
  const cam = FACECAM_SOURCES[settings.facecamSource];
  if (settings.facecamSource === "full") return { x: 0.2, y: 0.06, w: 0.6, h: 0.88 };
  // Hindari sisi tempat facecam berada agar gameplay tetap bersih.
  const fromLeft = cam.x < 0.5;
  return fromLeft
    ? { x: 0.32, y: 0.06, w: 0.5, h: 0.88 }
    : { x: 0.18, y: 0.06, w: 0.5, h: 0.88 };
}

type PaneProps = {
  videoId: string;
  start: number;
  end: number;
  rect: Rect;
  muted: boolean;
  playerId: string;
  onTime?: (t: number) => void;
  onReady?: (win: Window) => void;
};

/** Satu jendela crop dari player YouTube: hanya area rect yang terlihat. */
function CropPane({ videoId, start, end, rect, muted, playerId, onTime, onReady }: PaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const w = Math.max(r.width / rect.w, ((r.height * 16) / 9) / rect.h);
        setBox({ w, h: (w * 9) / 16 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [rect.w, rect.h]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const handshake = () => {
      const win = frame.contentWindow;
      if (!win) return;
      win.postMessage(
        JSON.stringify({ event: "listening", id: playerId, channel: "widget" }),
        "*",
      );
      onReady?.(win);
    };
    frame.addEventListener("load", handshake);
    const t = setInterval(handshake, 1000);
    const timeout = setTimeout(() => clearInterval(t), 6000);
    return () => {
      frame.removeEventListener("load", handshake);
      clearInterval(t);
      clearTimeout(timeout);
    };
  }, [playerId, onReady]);

  useEffect(() => {
    if (!onTime) return;
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string" || !event.data.includes("infoDelivery")) return;
      try {
        const parsed = JSON.parse(event.data) as {
          id?: string;
          info?: { currentTime?: number };
        };
        if (parsed.id !== playerId) return;
        const t = parsed.info?.currentTime;
        if (typeof t === "number") onTime(t);
      } catch {
        /* pesan bukan JSON YouTube */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playerId, onTime]);

  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?start=${Math.floor(start)}&end=${Math.ceil(end)}` +
    `&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&disablekb=1` +
    `&enablejsapi=1&widgetid=1&mute=${muted ? 1 : 0}`;

  const left = box ? -(rect.x + rect.w / 2) * box.w : 0;
  const top = box ? -(rect.y + rect.h / 2) * box.h : 0;

  return (
    <div ref={hostRef} className="relative size-full overflow-hidden bg-background">
      <div
        className="absolute top-1/2 left-1/2"
        style={
          box
            ? {
                width: box.w,
                height: box.h,
                marginLeft: left,
                marginTop: top,
              }
            : { width: "100%", height: "100%", marginLeft: 0, marginTop: 0 }
        }
      >
        <iframe
          ref={frameRef}
          id={playerId}
          src={src}
          title="Sumber klip"
          className="pointer-events-none size-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      </div>
    </div>
  );
}

/**
 * Pratinjau hasil edit klip tanpa unggahan file: durasi dibatasi ke rentang
 * potongan, frame di-crop sesuai rasio + layout, subtitle dan hook ditempel.
 */
export function ClipEmbed({
  clip,
  settings,
  index,
}: {
  clip: ClipResult;
  settings: ClipSettings;
  index: number;
}) {
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const windowsRef = useRef<Window[]>([]);
  const duration = Math.max(1, clip.endSeconds - clip.startSeconds);
  const idBase = `ytclip-${clip.id}-${index}`;

  const command = useCallback((func: string, args: unknown[] = []) => {
    for (const win of windowsRef.current) {
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    }
  }, []);

  const registerWindow = useCallback((win: Window) => {
    if (!windowsRef.current.includes(win)) windowsRef.current.push(win);
  }, []);

  const handleTime = useCallback(
    (t: number) => {
      const rel = Math.max(0, t - clip.startSeconds);
      setElapsed(Math.min(rel, duration));
      if (rel >= duration - 0.15) {
        command("pauseVideo");
        setFinished(true);
        setStarted(false);
      }
    },
    [clip.startSeconds, duration, command],
  );

  const play = () => {
    setFinished(false);
    command("seekTo", [clip.startSeconds, true]);
    command("playVideo");
    setStarted(true);
  };

  const restart = () => {
    setElapsed(0);
    play();
  };

  const activeCue = useMemo(() => {
    if (!settings.subtitles) return null;
    const abs = clip.startSeconds + elapsed;
    const cues = clip.subtitleCues ?? [];
    const hit = cues.find((c) => abs >= c.start && abs <= c.end);
    if (hit) return hit.text;
    const lines = clip.subtitleLines ?? [];
    if (!lines.length) return null;
    const step = duration / lines.length;
    return lines[Math.min(lines.length - 1, Math.floor(elapsed / step))] ?? null;
  }, [settings.subtitles, clip, elapsed, duration]);

  const showHook = settings.addHook && elapsed < 2.6;
  const camRect = resolveFacecamRect(settings);
  const gameRect = gameplayRect(settings);
  const split = settings.layout === "split";
  const camHeight = Math.min(70, Math.max(20, settings.facecamShare));

  useEffect(() => {
    setStarted(false);
    setFinished(false);
    setElapsed(0);
  }, [settings.aspectRatio, settings.layout, settings.facecamSource, clip.id]);

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-lg bg-background"
        style={{ aspectRatio: String(RATIO_VALUE[settings.aspectRatio]) }}
      >
        {split ? (
          <div className="flex size-full flex-col">
            <div style={{ height: `${camHeight}%` }} className="relative w-full">
              <CropPane
                videoId={clip.videoId ?? ""}
                start={clip.startSeconds}
                end={clip.endSeconds}
                rect={camRect}
                muted
                playerId={`${idBase}-cam`}
                onReady={registerWindow}
              />
            </div>
            <div style={{ height: `${100 - camHeight}%` }} className="relative w-full">
              <CropPane
                videoId={clip.videoId ?? ""}
                start={clip.startSeconds}
                end={clip.endSeconds}
                rect={gameRect}
                muted={false}
                playerId={`${idBase}-game`}
                onReady={registerWindow}
                onTime={handleTime}
              />
            </div>
          </div>
        ) : (
          <CropPane
            videoId={clip.videoId ?? ""}
            start={clip.startSeconds}
            end={clip.endSeconds}
            rect={gameRect}
            muted={false}
            playerId={`${idBase}-main`}
            onReady={registerWindow}
            onTime={handleTime}
          />
        )}

        {showHook ? (
          <div className="pointer-events-none absolute inset-x-0 top-[6%] flex justify-center px-3">
            <span className="font-display rounded-md bg-background/75 px-2 py-1 text-center text-[11px] leading-tight tracking-wide text-primary uppercase">
              {clip.title}
            </span>
          </div>
        ) : null}

        {activeCue ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[8%] flex justify-center px-3 text-center">
            <SubtitleText style={settings.subtitleStyle} text={activeCue} size="sm" />
          </div>
        ) : null}

        <span className="font-display pointer-events-none absolute top-2 left-2 z-30 rounded bg-background/80 px-1.5 py-0.5 text-[10px] tracking-wider">
          {formatTimecode(elapsed)} / {formatTimecode(duration)}
        </span>

        {!started ? (
          <button
            type="button"
            onClick={play}
            aria-label={`Putar hasil edit ${clip.title}`}
            className="absolute inset-0 z-20 flex items-center justify-center bg-background/30"
          >
            <span className="glow-ring flex size-12 items-center justify-center rounded-full border border-primary/60 bg-background/75 text-primary transition-transform hover:scale-110">
              {finished ? <RotateCcw className="size-5" /> : <Play className="size-5" />}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={restart}
            aria-label="Ulang dari awal potongan"
            className="absolute top-2 right-2 z-30 flex size-7 items-center justify-center rounded-full bg-background/80"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}

        {started && elapsed === 0 ? (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-primary" />
          </span>
        ) : null}
      </div>

      <div className="h-1 overflow-hidden rounded bg-surface">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }}
        />
      </div>
    </div>
  );
}

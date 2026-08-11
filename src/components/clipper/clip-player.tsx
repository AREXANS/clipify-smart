import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import type {
  ClipResult,
  ClipSettings,
  SubtitleCue,
  SubtitleStyle,
} from "@/lib/clip-settings";
import { formatTimecode } from "@/lib/clip-settings";

const RATIO_CLASS: Record<ClipSettings["aspectRatio"], string> = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
};

const OUTLINE =
  "0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 2px 2px 0 #000, -2px -2px 0 #000";

function buildEmbedUrl(videoId: string, start: number, end: number) {
  const params = new URLSearchParams({
    start: String(Math.floor(start)),
    end: String(Math.ceil(end)),
    autoplay: "1",
    controls: "0",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    iv_load_policy: "3",
    fs: "0",
    disablekb: "1",
    cc_load_policy: "0",
  });
  return `https://www.youtube.com/embed/${videoId}?${params}`;
}

/** Animate karaoke word-pop based on progress through the current cue (0–1). */
function AnimatedSubtitle({
  style,
  text,
  progress,
}: {
  style: SubtitleStyle;
  text: string;
  progress: number;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const activeIndex = Math.min(words.length - 1, Math.floor(progress * words.length));

  if (style === "karaoke") {
    return (
      <span
        className="inline-flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-[13px] font-extrabold uppercase"
        style={{ textShadow: OUTLINE }}
      >
        {words.map((w, i) => (
          <span
            key={`${w}-${i}`}
            style={{
              color: i === activeIndex ? "#ffd93d" : "#ffffff",
              transform: i === activeIndex ? "scale(1.12)" : undefined,
              display: "inline-block",
              transition: "color 0.08s linear",
            }}
          >
            {w}
          </span>
        ))}
      </span>
    );
  }

  if (style === "bold") {
    return (
      <span
        className="font-display inline-block text-center text-[15px] leading-tight font-black tracking-wide uppercase"
        style={{ color: "#ffffff", textShadow: OUTLINE, WebkitTextStroke: "0.5px #000" }}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className="inline-block rounded-[3px] bg-black/62 px-2 py-0.5 text-center text-[13px] leading-snug font-medium text-white"
    >
      {text}
    </span>
  );
}

/** YouTube iframe CSS-cropped to fill a portrait/landscape container. */
function CroppedFrame({
  embedUrl,
  title,
}: {
  embedUrl: string;
  title: string;
}) {
  return (
    <div
      className="absolute left-1/2 top-0 h-full -translate-x-1/2"
      style={{ aspectRatio: "16 / 9" }}
    >
      <iframe
        src={embedUrl}
        title={title}
        allow="autoplay; encrypted-media"
        className="size-full border-0"
      />
    </div>
  );
}

/** Thumbnail state before playback starts. */
function ThumbnailState({
  clip,
  settings,
  onPlay,
}: {
  clip: ClipResult;
  settings: ClipSettings;
  onPlay: () => void;
}) {
  const thumb = clip.videoId
    ? `https://i.ytimg.com/vi/${clip.videoId}/hqdefault.jpg`
    : null;
  const isSplit = settings.layout === "split";

  return (
    <>
      {thumb ? (
        // For split layout, zoom-crop the thumbnail to preview the reframe
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={thumb}
            alt={`Pratinjau klip: ${clip.title}`}
            loading="lazy"
            className="absolute left-1/2 top-0 h-full -translate-x-1/2 object-cover"
            style={{ aspectRatio: "16 / 9" }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 grid-backdrop opacity-70" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-background/40" />

      {isSplit ? (
        <div
          className="absolute inset-x-0 top-0 border-b-2 border-dashed border-violet/60"
          style={{ height: `${settings.facecamShare}%` }}
        >
          <span className="font-display absolute top-1 left-1 rounded bg-background/70 px-1.5 py-0.5 text-[9px] tracking-widest text-violet uppercase">
            Facecam
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPlay}
        aria-label={`Putar klip ${clip.title}`}
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full border border-primary/60 bg-background/70 text-primary glow-ring transition-transform hover:scale-110">
          <Play className="size-5" />
        </span>
      </button>
    </>
  );
}

export function ClipPlayer({
  clip,
  settings,
}: {
  clip: ClipResult;
  settings: ClipSettings;
}) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const duration = Math.max(1, clip.endSeconds - clip.startSeconds);
  const isSplit = settings.layout === "split";

  // Convert absolute transcript cues to clip-relative times
  const relCues: SubtitleCue[] = (clip.subtitleCues ?? []).map((c) => ({
    start: c.start - clip.startSeconds,
    end: c.end - clip.startSeconds,
    text: c.text,
  }));

  // Current subtitle cue (or fallback)
  const currentCue = relCues.find((c) => elapsed >= c.start && elapsed < c.end);
  const subtitleText =
    currentCue?.text ?? (relCues.length === 0 ? clip.subtitleLines?.[0] : undefined);
  const karaokeProgress = currentCue
    ? Math.min(1, Math.max(0, (elapsed - currentCue.start) / Math.max(0.1, currentCue.end - currentCue.start)))
    : 0;

  // Hook title animation: fade in 0-0.3s, hold, fade out 2.8-3.5s
  const showHook = settings.addHook && elapsed < 3.5 && playing;
  const hookOpacity =
    elapsed < 0.3
      ? elapsed / 0.3
      : elapsed > 2.8
        ? Math.max(0, 1 - (elapsed - 2.8) / 0.7)
        : 1;

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.1;
        if (next >= duration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, duration]);

  const handleStop = () => {
    setPlaying(false);
    setElapsed(0);
  };

  if (!clip.videoId) return null;

  const embedUrl = buildEmbedUrl(clip.videoId, clip.startSeconds, clip.endSeconds);

  return (
    <div className={`relative overflow-hidden bg-background ${RATIO_CLASS[settings.aspectRatio]}`}>
      {playing ? (
        <>
          {/* Video — CSS-cropped to target aspect ratio */}
          {isSplit ? (
            <>
              {/* Facecam zone (top): zoomed thumbnail crop simulating streamer cam */}
              <div
                className="absolute inset-x-0 top-0 overflow-hidden border-b-2 border-violet/50"
                style={{ height: `${settings.facecamShare}%` }}
              >
                <img
                  src={`https://i.ytimg.com/vi/${clip.videoId}/hqdefault.jpg`}
                  alt=""
                  className="absolute left-1/2 top-0 h-full -translate-x-1/2 object-cover"
                  style={{ aspectRatio: "16 / 9", filter: "saturate(1.15) contrast(1.05)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-violet/15 to-transparent" />
                <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
                </span>
              </div>
              {/* Gameplay zone (bottom): actual video */}
              <div
                className="absolute inset-x-0 bottom-0 overflow-hidden"
                style={{ height: `${100 - settings.facecamShare}%` }}
              >
                <CroppedFrame embedUrl={embedUrl} title={clip.title} />
              </div>
            </>
          ) : (
            <CroppedFrame embedUrl={embedUrl} title={clip.title} />
          )}

          {/* Hide YouTube branding in bottom-right */}
          <div className="pointer-events-none absolute right-0 bottom-0 z-10 h-7 w-20 bg-background" />

          {/* Hook title overlay */}
          {showHook && (
            <div
              className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/90 via-background/50 to-transparent px-3 pb-10 pt-3"
              style={{ opacity: hookOpacity }}
            >
              <p
                className="font-display text-center text-sm font-black tracking-wide text-white uppercase"
                style={{ textShadow: OUTLINE }}
              >
                {clip.title}
              </p>
            </div>
          )}

          {/* Burned-in subtitle */}
          {settings.subtitles && subtitleText && (
            <div
              className={`absolute inset-x-2 z-20 flex justify-center text-center ${
                isSplit ? "bottom-2" : "bottom-4"
              }`}
            >
              <AnimatedSubtitle
                style={settings.subtitleStyle}
                text={subtitleText}
                progress={karaokeProgress}
              />
            </div>
          )}

          {/* Clip progress bar */}
          <div className="absolute inset-x-0 bottom-0 z-30 h-1 bg-foreground/20">
            <div
              className="h-full bg-primary"
              style={{ width: `${(elapsed / duration) * 100}%`, transition: "width 0.1s linear" }}
            />
          </div>

          {/* Time + stop button */}
          <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
            <span className="font-display rounded bg-background/80 px-1.5 py-0.5 text-[10px] tracking-wider text-foreground">
              {formatTimecode(elapsed)} / {formatTimecode(duration)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleStop}
            aria-label="Hentikan pratinjau"
            className="absolute top-2 right-2 z-30 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground transition-colors hover:bg-background"
          >
            <Square className="size-3.5" />
          </button>
        </>
      ) : (
        <ThumbnailState clip={clip} settings={settings} onPlay={() => setPlaying(true)} />
      )}
    </div>
  );
}

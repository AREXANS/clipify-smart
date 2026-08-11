import { useState } from "react";
import { Download, ExternalLink, Loader2, Play, Sparkles } from "lucide-react";
import { formatTimecode, type ClipResult, type ClipSettings } from "@/lib/clip-settings";
import { SubtitleText } from "@/components/clipper/subtitle-preview";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const RATIO_CLASS: Record<ClipSettings["aspectRatio"], string> = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
};

export function ClipCard({
  clip,
  settings,
  index,
}: {
  clip: ClipResult;
  settings: ClipSettings;
  index: number;
}) {
  const [playing, setPlaying] = useState(false);
  const ready = clip.status === "ready";
  const subtitleLine = clip.subtitleLines?.[0] ?? clip.title;
  const thumb = clip.videoId
    ? `https://i.ytimg.com/vi/${clip.videoId}/hqdefault.jpg`
    : null;

  return (
    <article className="glass-panel overflow-hidden rounded-xl">
      <div className={`relative ${RATIO_CLASS[settings.aspectRatio]} bg-background`}>
        {playing && clip.previewUrl ? (
          <iframe
            src={`${clip.previewUrl}&autoplay=1`}
            title={clip.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <>
            {thumb ? (
              <img
                src={thumb}
                alt={`Pratinjau klip: ${clip.title}`}
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid-backdrop opacity-70" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/25 to-background/55" />

            {settings.layout === "split" ? (
              <div
                className="absolute inset-x-0 top-0 border-b border-dashed border-violet/70"
                style={{ height: `${settings.facecamShare}%` }}
              >
                <span className="font-display absolute top-1 left-1 rounded bg-background/70 px-1.5 py-0.5 text-[9px] tracking-widest text-violet uppercase">
                  Facecam
                </span>
              </div>
            ) : null}

            {ready && clip.previewUrl ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={`Putar pratinjau ${clip.title}`}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full border border-primary/60 bg-background/70 text-primary glow-ring">
                  <Play className="size-5" />
                </span>
              </button>
            ) : null}

            {!ready ? (
              <div className="absolute inset-0 scan-sheen flex flex-col items-center justify-center gap-2 bg-background/70">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {clip.status === "queued" ? "Menunggu antrian" : "Merender klip"}
                </span>
              </div>
            ) : null}

            <span className="font-display absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[10px] tracking-widest">
              #{index + 1}
            </span>
            <span className="font-display absolute top-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-primary">
              {clip.score}
            </span>

            {settings.subtitles ? (
              <span className="absolute inset-x-2 bottom-3 flex justify-center text-center">
                <SubtitleText style={settings.subtitleStyle} text={subtitleLine} />
              </span>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-[0.95rem] leading-tight font-semibold">{clip.title}</h3>
          <p className="text-sm text-muted-foreground">
            {formatTimecode(clip.startSeconds)} – {formatTimecode(clip.endSeconds)} ·{" "}
            {Math.round(clip.endSeconds - clip.startSeconds)} detik
          </p>
        </div>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {clip.reason}
        </p>

        {!ready ? <Progress value={clip.progress} /> : null}

        <div className="flex gap-2">
          {clip.downloadUrl ? (
            <Button variant="secondary" size="sm" className="flex-1" asChild>
              <a href={clip.downloadUrl} download>
                <Download className="size-4" /> Unduh MP4
              </a>
            </Button>
          ) : null}
          {clip.videoId ? (
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a
                href={`https://www.youtube.com/watch?v=${clip.videoId}&t=${Math.floor(clip.startSeconds)}s`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" /> Buka di YouTube
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

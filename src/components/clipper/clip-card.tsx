import { Download, ExternalLink, FileVideo, Loader2, Sparkles } from "lucide-react";
import { formatTimecode, type ClipResult, type ClipSettings } from "@/lib/clip-settings";
import { ClipRender } from "@/components/clipper/clip-render";
import { ClipEmbed } from "@/components/clipper/clip-embed";

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
  sourceUrl,
}: {
  clip: ClipResult;
  settings: ClipSettings;
  index: number;
  sourceUrl?: string | undefined;
}) {
  const ready = clip.status === "ready";

  if (ready) {
    const body = (
      <div className="space-y-2 px-1 pt-3">
        <h3 className="text-[0.95rem] leading-tight font-semibold">
          #{index + 1} · {clip.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatTimecode(clip.startSeconds)} – {formatTimecode(clip.endSeconds)} ·{" "}
          {Math.round(clip.endSeconds - clip.startSeconds)} detik · skor {clip.score}
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {clip.reason}
        </p>
      </div>
    );

    if (sourceUrl) {
      return (
        <article className="glass-panel overflow-hidden rounded-xl p-3">
          <ClipRender clip={clip} settings={settings} sourceUrl={sourceUrl} index={index} />
          {body}
        </article>
      );
    }

    if (clip.videoId) {
      return (
        <article className="glass-panel overflow-hidden rounded-xl p-3">
          <ClipEmbed clip={clip} settings={settings} index={index} />
          {body}
          <p className="px-1 pt-2 text-sm text-muted-foreground">
            Pratinjau hasil edit (durasi potongan). Unggah MP4 sumber untuk merender dan
            mengunduh file.
          </p>
        </article>
      );
    }
  }


  return (
    <article className="glass-panel overflow-hidden rounded-xl">
      <div className={`relative ${RATIO_CLASS[settings.aspectRatio]} bg-background`}>
        {ready && clip.previewUrl ? (
          <iframe
            src={clip.previewUrl}
            title={`Preview ${clip.title}`}
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : ready ? (
          <>
            <div className="absolute inset-0 grid-backdrop opacity-70" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center">
              <FileVideo className="size-7 text-primary" />
              <p className="font-display text-sm tracking-widest uppercase">
                Butuh file sumber
              </p>
              <p className="text-sm text-muted-foreground">
                Preview tidak tersedia. Buka momennya di YouTube atau unggah MP4 untuk
                membuat hasil edit {Math.round(clip.endSeconds - clip.startSeconds)} detik.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 grid-backdrop opacity-70" />
            <div className="absolute inset-0 scan-sheen flex flex-col items-center justify-center gap-2 bg-background/70">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {clip.status === "queued" ? "Menunggu antrian" : "Merender klip"}
              </span>
            </div>
          </>
        )}

        {/* Score badge — always visible */}
        <span className="font-display pointer-events-none absolute top-2 right-2 z-40 rounded-md bg-background/80 px-2 py-1 text-[10px] text-primary">
          {clip.score}
        </span>
        <span className="font-display pointer-events-none absolute top-2 left-2 z-40 rounded-md bg-background/80 px-2 py-1 text-[10px] tracking-widest">
          #{index + 1}
        </span>

        {!ready ? <Progress value={clip.progress} className="absolute inset-x-0 bottom-0 z-40 h-1" /> : null}
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

import { Check, Download, Loader2, Sparkles } from "lucide-react";
import { formatTimecode, type ClipResult, type ClipSettings } from "@/lib/clip-settings";
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
  const ready = clip.status === "ready";

  return (
    <article className="glass-panel overflow-hidden rounded-xl">
      <div className={`relative ${RATIO_CLASS[settings.aspectRatio]} bg-background`}>
        <div className="absolute inset-0 grid-backdrop opacity-70" />

        {settings.layout === "split" ? (
          <div className="absolute inset-0 flex flex-col">
            <div
              className="flex items-center justify-center border-b border-primary/30 bg-violet/15"
              style={{ height: `${settings.facecamShare}%` }}
            >
              <span className="font-display text-[10px] tracking-widest text-violet uppercase">
                Facecam
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center bg-primary/10">
              <span className="font-display text-[10px] tracking-widest text-cyan uppercase">
                Gameplay
              </span>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
            <span className="font-display text-[10px] tracking-widest text-cyan uppercase">
              {settings.layout === "gameplay" ? "Gameplay" : "Auto reframe"}
            </span>
          </div>
        )}

        {!ready ? (
          <div className="absolute inset-0 scan-sheen flex flex-col items-center justify-center gap-2 bg-background/70">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {clip.status === "queued" ? "Menunggu antrian" : "Merender klip"}
            </span>
          </div>
        ) : null}

        <span className="absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1 font-display text-[10px] tracking-widest">
          #{index + 1}
        </span>
        <span className="absolute top-2 right-2 rounded-md bg-background/80 px-2 py-1 font-display text-[10px] text-primary">
          {clip.score}
        </span>

        {settings.subtitles && ready ? (
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-background/85 px-2 py-1 text-center text-[11px] font-bold tracking-wide text-cyan uppercase">
            subtitle otomatis
          </span>
        ) : null}
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

        {ready ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            asChild={Boolean(clip.downloadUrl)}
            disabled={!clip.downloadUrl}
          >
            {clip.downloadUrl ? (
              <a href={clip.downloadUrl} download>
                <Download className="size-4" /> Unduh klip
              </a>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Check className="size-4" /> Siap (pratinjau)
              </span>
            )}
          </Button>
        ) : (
          <Progress value={clip.progress} />
        )}
      </div>
    </article>
  );
}

import { Scissors } from "lucide-react";
import { formatTimecode, type ClipResult } from "@/lib/clip-settings";
import { Slider } from "@/components/ui/slider";

/**
 * Penggeser durasi klip: atur titik mulai dan titik akhir langsung di website
 * sehingga pratinjau, render, dan unduhan memakai potongan baru.
 */
export function ClipTrim({
  clip,
  onTrim,
}: {
  clip: ClipResult;
  onTrim: (start: number, end: number) => void;
}) {
  const span = 45;
  const min = Math.max(0, Math.round(clip.startSeconds - span));
  const max = Math.round(clip.endSeconds + span);
  const duration = Math.round(clip.endSeconds - clip.startSeconds);

  return (
    <div className="space-y-2 px-1 pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Scissors className="size-3.5 text-primary" /> Geser durasi potongan
        </span>
        <span className="font-display text-xs text-primary">
          {formatTimecode(clip.startSeconds)} – {formatTimecode(clip.endSeconds)} · {duration}s
        </span>
      </div>
      <Slider
        value={[Math.round(clip.startSeconds), Math.round(clip.endSeconds)]}
        min={min}
        max={max}
        step={1}
        minStepsBetweenThumbs={3}
        aria-label={`Durasi klip ${clip.title}`}
        onValueChange={(values) => {
          const [start, end] = values;
          if (start === undefined || end === undefined) return;
          onTrim(start, Math.max(start + 3, end));
        }}
      />
    </div>
  );
}

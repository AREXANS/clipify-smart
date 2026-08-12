import { useState } from "react";
import { Check, Copy, Hash } from "lucide-react";
import { toast } from "sonner";
import type { ClipResult } from "@/lib/clip-settings";
import { Button } from "@/components/ui/button";

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} disalin`);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Browser menolak akses clipboard.");
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </Button>
  );
}

/** Judul, caption, dan hashtag siap tempel saat upload Shorts / Reels / TikTok. */
export function ShortsKit({ clip }: { clip: ClipResult }) {
  const hashtags = clip.hashtags ?? [];
  const title = clip.shortsTitle ?? clip.title;
  const caption = clip.caption ?? clip.reason;
  const full = [title, "", caption, "", hashtags.join(" ")].join("\n").trim();

  return (
    <section className="mt-3 space-y-3 rounded-lg border border-border bg-surface/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-xs tracking-widest uppercase">
          Siap upload Shorts
        </h4>
        <CopyButton label="Salin semua" value={full} />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase">Judul</p>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <CopyButton label="Judul" value={title} />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase">Caption</p>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm whitespace-pre-line text-muted-foreground">{caption}</p>
          <CopyButton label="Caption" value={caption} />
        </div>
      </div>

      {hashtags.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase">Hashtag</p>
          <ul className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <li
                key={tag}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-accent/50 px-2 py-0.5 text-xs text-primary"
              >
                <Hash className="size-3" />
                {tag.replace(/^#/, "")}
              </li>
            ))}
          </ul>
          <CopyButton label="Hashtag" value={hashtags.join(" ")} />
        </div>
      ) : null}
    </section>
  );
}

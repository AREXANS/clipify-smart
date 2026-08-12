import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Cpu,
  FileVideo,
  Link2,
  Loader2,
  ScissorsLineDashed,
  Youtube,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPanel } from "@/components/clipper/settings-panel";
import { ClipCard } from "@/components/clipper/clip-card";
import {
  DEFAULT_SETTINGS,
  isValidYoutubeUrl,
  type ClipJob,
  type ClipSettings,
} from "@/lib/clip-settings";
import { createClipJob, getClipJob } from "@/lib/clipper.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClipForge — Auto Clipper YouTube untuk Mobile Legends" },
      {
        name: "description",
        content:
          "Tempel URL YouTube dan hasilkan klip vertikal otomatis: pilih rasio, subtitle otomatis, dan pisah facecam dengan gameplay ML.",
      },
      { property: "og:title", content: "ClipForge — Auto Clipper YouTube" },
      {
        property: "og:description",
        content:
          "Ubah satu VOD YouTube menjadi banyak klip siap TikTok, Reels, dan Shorts dengan split facecam dan gameplay otomatis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = [
  { icon: Link2, title: "Tempel URL", desc: "Satu tautan YouTube, tanpa unggah file." },
  { icon: Cpu, title: "Atur preferensi", desc: "Rasio, subtitle, dan split facecam." },
  { icon: ScissorsLineDashed, title: "Generate", desc: "AI memilih momen paling seru." },
];

function Index() {
  const [settings, setSettings] = useState<ClipSettings>(DEFAULT_SETTINGS);
  const [job, setJob] = useState<ClipJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);

  const videoId = job?.clips.find((c) => c.videoId)?.videoId;
  // Default: stream langsung dari YouTube lewat proxy same-origin (dukungan Range,
  // jadi video panjang pun cukup di-seek ke rentang klip). File unggahan opsional.
  const sourceUrl =
    uploadUrl ?? (videoId ? `/api/public/yt-stream?v=${videoId}` : null);

  const handleSourceFile = (file: File | undefined) => {
    if (!file) return;
    setUploadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setSourceName(file.name);
    toast.success("Video sumber siap", {
      description: "Klip akan dirender ulang sungguhan dari file ini.",
    });
  };

  const submitJob = useServerFn(createClipJob);
  const pollJob = useServerFn(getClipJob);

  const update = useCallback(
    <K extends keyof ClipSettings>(key: K, value: ClipSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    if (!job.clips.some((c) => c.status !== "ready")) return;
    const id = setInterval(() => {
      pollJob({ data: { jobId: job.id } })
        .then(setJob)
        .catch((err: Error) => {
          clearInterval(id);
          toast.error(err.message);
        });
    }, 1200);
    return () => clearInterval(id);
  }, [job, pollJob]);

  const handleGenerate = async () => {
    if (!isValidYoutubeUrl(settings.url)) {
      setUrlError("Masukkan URL YouTube yang valid (youtube.com/watch?v=... atau youtu.be/...).");
      return;
    }
    setUrlError(null);
    setSubmitting(true);
    try {
      const created = await submitJob({ data: { ...settings, url: settings.url.trim() } });
      setJob(created);
      if (created.status === "failed") {
        toast.error(created.message ?? "Analisis gagal.");
      } else {
        toast.success(`${created.clips.length} klip ditemukan`, {
          description: created.message,
        });
      }
      setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai proses.");
    } finally {
      setSubmitting(false);
    }
  };

  const readyCount = job?.clips.filter((c) => c.status === "ready").length ?? 0;

  return (
    <div className="min-h-screen">
      <Toaster />

      <header className="relative overflow-hidden">
        <div className="absolute inset-0 grid-backdrop" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-8 pb-16">
          <nav className="flex items-center justify-between">
            <span className="font-display flex items-center gap-2 text-lg tracking-wider">
              <Zap className="size-5 text-primary" />
              CLIP<span className="text-primary">FORGE</span>
            </span>
            <span className="rounded-full border border-border bg-surface/70 px-3 py-1 text-sm text-muted-foreground">
              Mobile Legends ready
            </span>
          </nav>

          <div className="mx-auto mt-16 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-accent/60 px-3 py-1 text-sm text-primary">
              <span className="size-1.5 rounded-full bg-primary pulse-dot" />
              Auto clipper berbasis URL
            </span>
            <h1 className="glow-text mt-6 text-4xl leading-[1.05] sm:text-6xl">
              Satu link YouTube,
              <br />
              puluhan klip viral.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Tempel URL siaran atau VOD kamu. ClipForge memilih momen terbaik, memisahkan
              facecam dari gameplay, dan menempel subtitle otomatis.
            </p>
          </div>

          <div className="glass-panel mx-auto mt-10 max-w-2xl rounded-2xl p-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Youtube className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={settings.url}
                  onChange={(e) => update("url", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleGenerate();
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  aria-label="URL video YouTube"
                  className="h-12 border-transparent bg-surface/70 pl-10 text-base"
                />
              </div>
              <Button
                size="lg"
                className="h-12 px-6"
                onClick={() => void handleGenerate()}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ScissorsLineDashed className="size-4" />
                )}
                Generate klip
              </Button>
            </div>
            {urlError ? (
              <p className="px-3 py-2 text-sm text-destructive">{urlError}</p>
            ) : null}

            <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-left transition-colors hover:border-primary/60">
              <FileVideo className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] leading-tight font-semibold">
                  {sourceName ?? "Unggah file video sumber (MP4)"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  Wajib untuk render sungguhan: crop rasio, split facecam 50/50, subtitle
                  terbakar, dan file siap diunduh.
                </span>
              </span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleSourceFile(e.target.files?.[0])}
              />
            </label>
          </div>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.title}
                className="rounded-xl border border-border bg-surface/50 px-4 py-4"
              >
                <step.icon className="size-5 text-primary" />
                <p className="mt-3 font-semibold">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="glass-panel h-fit rounded-2xl p-6 lg:sticky lg:top-6">
            <h2 className="font-display mb-6 text-base tracking-widest uppercase">
              Pengaturan
            </h2>
            <SettingsPanel
              settings={settings}
              onChange={update}
              disabled={submitting}
            />
          </div>

          <div ref={resultsRef} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base tracking-widest uppercase">
                Hasil klip
              </h2>
              {job ? (
                <span className="text-sm text-muted-foreground">
                  {readyCount}/{job.clips.length} klip siap
                </span>
              ) : null}
            </div>

            {job?.message ? (
              <p className="rounded-lg border border-primary/30 bg-accent/50 px-4 py-3 text-sm text-muted-foreground">
                {job.message}
              </p>
            ) : null}

            {submitting ? (
              <div className="glass-panel flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="font-display text-sm tracking-widest uppercase">
                  Menganalisis video
                </p>
                <p className="max-w-sm text-muted-foreground">
                  Mengambil transkrip asli video lalu memilih momen terbaik dengan AI.
                  Proses ini bisa memakan 10–40 detik untuk VOD panjang.
                </p>
              </div>
            ) : !job ? (
              <div className="glass-panel flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center">
                <ScissorsLineDashed className="size-8 text-primary" />
                <p className="font-display text-sm tracking-widest uppercase">
                  Belum ada klip
                </p>
                <p className="max-w-sm text-muted-foreground">
                  Tempel URL YouTube di atas, unggah file video sumbernya, atur preferensi
                  di panel kiri, lalu tekan Generate klip.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {job.clips.map((clip, i) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    settings={settings}
                    index={i}
                    sourceUrl={sourceUrl ?? undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
          ClipForge — pastikan kamu punya hak atas video yang diproses.
        </div>
      </footer>
    </div>
  );
}

import { useRef } from "react";
import { Grip, Layers, ScanFace, Sparkles } from "lucide-react";
import { SubtitleStylePreview } from "@/components/clipper/subtitle-preview";
import { FACECAM_SOURCES, resolveFacecamRect } from "@/lib/render-clip";

import {
  ASPECT_RATIOS,
  FACECAM_SOURCE_OPTIONS,
  LAYOUT_MODES,
  SUBTITLE_STYLES,
  type ClipSettings,
} from "@/lib/clip-settings";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  settings: ClipSettings;
  onChange: <K extends keyof ClipSettings>(key: K, value: ClipSettings[K]) => void;
  disabled?: boolean;
};

function SectionTitle({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Layers;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary glow-ring">
        <Icon className="size-4" />
      </span>
      <div>
        <h3 className="font-display text-sm tracking-wide uppercase">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[0.95rem] leading-tight font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled ?? false}
      />
    </div>
  );
}

export function SettingsPanel({ settings, onChange, disabled }: Props) {
  const camPreview = resolveFacecamRect(settings);
  const draggingRef = useRef(false);

  const moveFacecam = (clientX: number, clientY: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    if (!draggingRef.current || bounds.width === 0 || bounds.height === 0) return;
    const pointerX = (clientX - bounds.left) / bounds.width;
    const pointerY = (clientY - bounds.top) / bounds.height;
    // Titik acuan preset (belum di-clamp) agar kotak bisa digeser sampai mentok
    // tepi atas/bawah/kiri/kanan frame sumber.
    const preset = FACECAM_SOURCES[settings.facecamSource] ?? FACECAM_SOURCES.auto;
    const baseCenterX = preset.x + preset.w / 2;
    const baseCenterY = preset.y + preset.h / 2;
    const clamp = (v: number) => Math.max(-100, Math.min(100, v));
    onChange("facecamOffsetX", Math.round(clamp((pointerX - baseCenterX) * 100)));
    onChange("facecamOffsetY", Math.round(clamp((pointerY - baseCenterY) * 100)));
  };


  return (

    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle
          icon={Layers}
          title="Rasio & Tata Letak"
          desc="Tentukan bentuk frame dan cara facecam disusun."
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASPECT_RATIOS.map((ratio) => {
            const active = settings.aspectRatio === ratio.value;
            return (
              <button
                key={ratio.value}
                type="button"
                disabled={disabled ?? false}
                onClick={() => onChange("aspectRatio", ratio.value)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary/60 bg-accent glow-ring"
                    : "border-border bg-surface/60 hover:bg-surface-2"
                }`}
              >
                <span className="font-display block text-base">{ratio.label}</span>
                <span className="text-xs text-muted-foreground">{ratio.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          {LAYOUT_MODES.map((mode) => {
            const active = settings.layout === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                disabled={disabled ?? false}
                onClick={() => onChange("layout", mode.value)}
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary/60 bg-accent glow-ring"
                    : "border-border bg-surface/60 hover:bg-surface-2"
                }`}
              >
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                    active ? "bg-primary pulse-dot" : "bg-muted-foreground/40"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-[0.95rem] leading-tight font-semibold">
                    {mode.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {mode.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {settings.layout === "split" ? (
          <div className="rounded-lg border border-border bg-surface/60 px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-[0.95rem]">Porsi tinggi facecam</Label>
              <span className="font-display text-sm text-primary">
                {settings.facecamShare}%
              </span>
            </div>
            <Slider
              value={[settings.facecamShare]}
              min={10}
              max={80}
              step={5}
              disabled={disabled ?? false}
              onValueChange={([v]) => onChange("facecamShare", v ?? 50)}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              50% = layar terbagi dua sama besar (facecam atas, gameplay bawah).
            </p>

            <div className="mt-4 space-y-2">
              <Label className="text-[0.95rem]">Posisi facecam di video sumber</Label>
              <Select
                value={settings.facecamSource}
                onValueChange={(v) =>
                  onChange("facecamSource", v as ClipSettings["facecamSource"])
                }
                disabled={disabled ?? false}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FACECAM_SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Pilih pojok tempat kamera streamer berada, lalu atur zoom manual di bawah.
              </p>
            </div>

            <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface/40 px-3 py-3">
              <div className="flex items-center justify-between">
                <Label className="text-[0.95rem]">Zoom facecam</Label>
                <span className="font-display text-sm text-primary">
                  {settings.facecamZoom}%
                </span>
              </div>
              <Slider
                value={[settings.facecamZoom]}
                min={60}
                max={300}
                step={5}
                disabled={disabled ?? false}
                onValueChange={([v]) => onChange("facecamZoom", v ?? 100)}
              />
              <p className="text-sm text-muted-foreground">
                100% = ukuran kotak pojok default. Naikkan untuk zoom lebih dekat ke wajah.
              </p>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Geser area facecam langsung</Label>
                  <span className="font-display text-xs text-primary">
                    X {settings.facecamOffsetX}% · Y {settings.facecamOffsetY}%
                  </span>
                </div>
                <div
                  className={`relative aspect-video w-full touch-none select-none overflow-hidden rounded border border-border bg-surface-2 ${disabled ? "opacity-50" : "cursor-crosshair"}`}
                  onPointerDown={(event) => {
                    if (disabled) return;
                    event.preventDefault();
                    draggingRef.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    moveFacecam(event.clientX, event.clientY, event.currentTarget);
                  }}
                  onPointerMove={(event) => {
                    if (draggingRef.current) {
                      moveFacecam(event.clientX, event.clientY, event.currentTarget);
                    }
                  }}
                  onPointerUp={(event) => {
                    draggingRef.current = false;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => {
                    draggingRef.current = false;
                  }}
                  aria-label="Area sumber video untuk menggeser kotak facecam"
                >
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
                    VIDEO SUMBER 16:9
                  </span>
                  <span
                    className="pointer-events-none absolute flex items-center justify-center rounded-sm border-2 border-primary bg-primary/25 shadow-sm"
                    style={{
                      left: `${camPreview.x * 100}%`,
                      top: `${camPreview.y * 100}%`,
                      width: `${camPreview.w * 100}%`,
                      height: `${camPreview.h * 100}%`,
                    }}
                  >
                    <Grip className="size-4 text-primary" />
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Tekan lalu seret kotak biru ke posisi kamera pada video sumber.
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2" aria-hidden>
              <div className="flex h-24 w-14 flex-col overflow-hidden rounded-md border border-primary/40">
                <div
                  className="flex items-center justify-center bg-violet/25 text-[10px]"
                  style={{ height: `${settings.facecamShare}%` }}
                >
                  CAM
                </div>
                <div className="flex flex-1 items-center justify-center bg-primary/20 text-[10px]">
                  GAME
                </div>
              </div>
              <p className="self-center text-sm text-muted-foreground">
                Pratinjau susunan frame vertikal.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <div className="neon-divider" />

      <section className="space-y-4">
        <SectionTitle
          icon={ScanFace}
          title="Subtitle"
          desc="Teks otomatis dari audio, siap untuk tontonan tanpa suara."
        />
        <ToggleRow
          label="Aktifkan subtitle"
          desc="Transkrip otomatis dan burn-in ke video."
          checked={settings.subtitles}
          onCheckedChange={(v) => onChange("subtitles", v)}
          disabled={disabled ?? false}
        />
        {settings.subtitles ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Gaya subtitle</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {SUBTITLE_STYLES.map((s) => {
                  const active = settings.subtitleStyle === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={disabled ?? false}
                      aria-pressed={active}
                      onClick={() => onChange("subtitleStyle", s.value)}
                      className={`space-y-2 rounded-lg border p-2 text-left transition-colors disabled:opacity-50 ${
                        active
                          ? "border-primary/60 bg-accent glow-ring"
                          : "border-border bg-surface/60 hover:bg-surface-2"
                      }`}
                    >
                      <SubtitleStylePreview style={s.value} />
                      <span className="block px-1 text-[0.8rem] leading-tight font-semibold">
                        {s.label}
                      </span>
                      <span className="block px-1 pb-1 text-xs leading-snug text-muted-foreground">
                        {s.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 sm:max-w-[220px]">
              <Label>Bahasa</Label>
              <Select
                value={settings.subtitleLanguage}
                onValueChange={(v) => onChange("subtitleLanguage", v)}
                disabled={disabled ?? false}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Indonesia</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ms">Melayu</SelectItem>
                  <SelectItem value="auto">Deteksi otomatis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </section>

      <div className="neon-divider" />

      <section className="space-y-4">
        <SectionTitle
          icon={Sparkles}
          title="Output & Seleksi Momen"
          desc="Jumlah klip, durasi, dan cara analisis memilih highlight."
        />

        <ToggleRow
          label="Analisis AI (Lovable AI)"
          desc="Gunakan model AI untuk memilih momen viral. Matikan untuk analisis lokal tanpa kredit."
          checked={settings.useAi}
          onCheckedChange={(v) => onChange("useAi", v)}
          disabled={disabled ?? false}
        />

        <div className="rounded-lg border border-border bg-surface/60 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-[0.95rem]">Jumlah klip</Label>
            <span className="font-display text-sm text-primary">
              {settings.clipCount}
            </span>
          </div>
          <Slider
            value={[settings.clipCount]}
            min={1}
            max={12}
            step={1}
            disabled={disabled ?? false}
            onValueChange={([v]) => onChange("clipCount", v ?? 6)}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface/60 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-[0.95rem]">Durasi tiap klip</Label>
            <span className="font-display text-sm text-primary">
              {settings.minDuration}s – {settings.maxDuration}s
            </span>
          </div>
          <Slider
            value={[settings.minDuration, settings.maxDuration]}
            min={5}
            max={120}
            step={5}
            minStepsBetweenThumbs={1}
            disabled={disabled ?? false}
            onValueChange={([min, max]) => {
              onChange("minDuration", min ?? 20);
              onChange("maxDuration", max ?? 60);
            }}
          />
        </div>

        <ToggleRow
          label="Judul hook otomatis"
          desc="AI menulis judul menarik di detik pertama klip."
          checked={settings.addHook}
          onCheckedChange={(v) => onChange("addHook", v)}
          disabled={disabled ?? false}
        />
        <ToggleRow
          label="Buang jeda hening"
          desc="Potong bagian sepi agar tempo klip tetap padat."
          checked={settings.removeSilence}
          onCheckedChange={(v) => onChange("removeSilence", v)}
          disabled={disabled ?? false}
        />
        <ToggleRow
          label="Prioritaskan momen aksi"
          desc="Utamakan kill, savage, dan war berdasarkan audio serta UI game."
          checked={settings.highlightKills}
          onCheckedChange={(v) => onChange("highlightKills", v)}
          disabled={disabled ?? false}
        />
      </section>
    </div>
  );
}

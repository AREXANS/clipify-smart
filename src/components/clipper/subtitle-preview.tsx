import type { SubtitleStyle } from "@/lib/clip-settings";

const OUTLINE =
  "0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 2px 2px 0 #000, -2px -2px 0 #000";

export function SubtitleText({
  style,
  text,
  size = "md",
}: {
  style: SubtitleStyle;
  text: string;
  size?: "sm" | "md";
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const activeIndex = Math.min(words.length - 1, Math.floor(words.length / 2));
  const base = size === "sm" ? "text-[11px]" : "text-[13px]";

  if (style === "karaoke") {
    return (
      <span
        className={`inline-flex flex-wrap justify-center gap-x-1 gap-y-0.5 font-extrabold uppercase ${base}`}
        style={{ textShadow: OUTLINE }}
      >
        {words.map((w, i) => (
          <span
            key={`${w}-${i}`}
            style={{
              color: i === activeIndex ? "#ffd93d" : "#ffffff",
              transform: i === activeIndex ? "scale(1.12)" : undefined,
              display: "inline-block",
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
        className={`font-display inline-block text-center leading-tight font-black tracking-wide uppercase ${size === "sm" ? "text-[12px]" : "text-[15px]"}`}
        style={{ color: "#ffffff", textShadow: OUTLINE, WebkitTextStroke: "0.5px #000" }}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={`inline-block rounded-[3px] px-2 py-0.5 text-center leading-snug font-medium ${base}`}
      style={{ color: "#ffffff", backgroundColor: "rgba(0,0,0,0.62)" }}
    >
      {text}
    </span>
  );
}

/** Kotak pratinjau desain subtitle di atas latar mirip frame video. */
export function SubtitleStylePreview({
  style,
  text = "SAVAGE! Dia clutch 1 lawan 3",
}: {
  style: SubtitleStyle;
  text?: string;
}) {
  return (
    <div className="relative flex h-16 items-end justify-center overflow-hidden rounded-md border border-border bg-[linear-gradient(140deg,#1b2440,#0d1120_60%,#241a33)] px-2 pb-2">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 25%, rgba(0,255,231,0.25), transparent 55%), radial-gradient(circle at 75% 70%, rgba(168,85,247,0.28), transparent 55%)",
        }}
        aria-hidden
      />
      <span className="relative max-w-full">
        <SubtitleText style={style} text={text} size="sm" />
      </span>
    </div>
  );
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClipJob } from "./clip-settings";

const settingsSchema = z.object({
  url: z.string().url().max(300),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  layout: z.enum(["auto", "split", "gameplay"]),
  facecamShare: z.number().min(10).max(80),
  facecamSource: z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "full",
  ]),
  subtitles: z.boolean(),
  subtitleStyle: z.enum(["karaoke", "bold", "minimal"]),
  subtitleLanguage: z.string().min(2).max(5),
  clipCount: z.number().int().min(1).max(12),
  minDuration: z.number().int().min(5).max(180),
  maxDuration: z.number().int().min(10).max(240),
  addHook: z.boolean(),
  removeSilence: z.boolean(),
  highlightKills: z.boolean(),
  useAi: z.boolean(),
});

export const createClipJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data }): Promise<ClipJob> => {
    const { analyzeVideo, createProviderJob, getProviderConfig } = await import(
      "./clipper.server"
    );
    const analysis = await analyzeVideo(data);
    const config = getProviderConfig();
    if (!config || analysis.status === "failed") return analysis;
    return createProviderJob(config, data, analysis);
  });

export const getClipJob = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<ClipJob> => {
    const { fetchProviderJob, getProviderConfig } = await import("./clipper.server");
    const config = getProviderConfig();
    if (!config) {
      throw new Error("Layanan render video belum dikonfigurasi.");
    }
    return fetchProviderJob(config, data.jobId);
  });

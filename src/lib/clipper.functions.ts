import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClipJob } from "./clip-settings";
import {
  buildDemoJob,
  buildDemoJobId,
  createProviderJob,
  fetchProviderJob,
  getProviderConfig,
} from "./clipper.server";

const settingsSchema = z.object({
  url: z.string().url().max(300),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  layout: z.enum(["auto", "split", "gameplay"]),
  facecamShare: z.number().min(10).max(60),
  subtitles: z.boolean(),
  subtitleStyle: z.enum(["karaoke", "bold", "minimal"]),
  subtitleLanguage: z.string().min(2).max(5),
  clipCount: z.number().int().min(1).max(12),
  minDuration: z.number().int().min(5).max(180),
  maxDuration: z.number().int().min(10).max(240),
  addHook: z.boolean(),
  removeSilence: z.boolean(),
  highlightKills: z.boolean(),
});

export const createClipJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data }): Promise<ClipJob> => {
    const config = getProviderConfig();
    if (!config) {
      return buildDemoJob(buildDemoJobId(data));
    }
    return createProviderJob(config, data);
  });

export const getClipJob = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ jobId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ClipJob> => {
    if (data.jobId.startsWith("demo_")) {
      return buildDemoJob(data.jobId);
    }
    const config = getProviderConfig();
    if (!config) {
      return buildDemoJob(buildDemoJobId({ url: "https://youtu.be/00000000000" } as never));
    }
    return fetchProviderJob(config, data.jobId);
  });

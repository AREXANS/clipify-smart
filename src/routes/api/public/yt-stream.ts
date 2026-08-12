import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy stream video YouTube dengan dukungan HTTP Range.
 * Same-origin agar canvas tidak "tainted" saat merender klip.
 */
export const Route = createFileRoute("/api/public/yt-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const videoId = url.searchParams.get("v") ?? "";
        if (!/^[\w-]{11}$/.test(videoId)) {
          return new Response("videoId tidak valid", { status: 400 });
        }
        const { streamVideoRange } = await import("@/lib/youtube-stream.server");
        try {
          return await streamVideoRange(videoId, request.headers.get("range"));
        } catch (err) {
          return new Response(
            err instanceof Error ? err.message : "Gagal mengalirkan video",
            { status: 502 },
          );
        }
      },
    },
  },
});

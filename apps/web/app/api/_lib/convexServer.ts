import { ConvexHttpClient } from "convex/browser";

export function getConvexServerClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_URL is not configured (fallback NEXT_PUBLIC_CONVEX_URL also missing)"
    );
  }

  return new ConvexHttpClient(url);
}

import { recommendationPOST } from "@/lib/recommendations/server";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request) {
  return recommendationPOST(request, "daee");
}

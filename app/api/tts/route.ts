import { z } from "zod";
import { getAsker } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";

const Body = z.object({ text: z.string().trim().min(1).max(400), locale: z.string().max(8) });

// A multilingual voice by default; ELEVENLABS_VOICE_ID overrides it.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

/**
 * Speech for the guide's questions. Proxies ElevenLabs when ELEVENLABS_API_KEY is set, so
 * the key never reaches the browser; otherwise 204, and the browser speaks it itself.
 * Askers only, and only short text (the guide's own question).
 */
export async function POST(request: Request) {
  const asker = await getAsker();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!asker || !parsed.success) return new Response(null, { status: 400 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response(null, { status: 204 });

  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: parsed.data.text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !res.body) {
      logServerError("tts.elevenlabs", `status ${res.status}`);
      return new Response(null, { status: 204 });
    }
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError("tts.elevenlabs", error);
    return new Response(null, { status: 204 });
  }
}

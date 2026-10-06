import { z } from "zod";
import { getAsker } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";

const Body = z.object({ text: z.string().trim().min(1).max(400), locale: z.string().max(8) });

// A multilingual model, since the guide speaks seven languages including Arabic and Urdu.
// eleven_flash_v2_5 trades a little quality for latency: set ELEVENLABS_MODEL_ID to use it.
const DEFAULT_MODEL = "eleven_multilingual_v2";
// A premade voice (usable on every plan); library voices need a paid plan over the API.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

/** No audio: the browser speaks it. The response says which path was used. */
function fallback(reason: string) {
  console.info(`[tts] path=fallback reason=${reason}`);
  return new Response(null, { status: 204, headers: { "X-TTS-Path": "fallback", "X-TTS-Reason": reason } });
}

/**
 * Speech for the guide's questions. Proxies ElevenLabs when ELEVENLABS_API_KEY is set, so
 * the key never reaches the browser; otherwise 204 and the browser's own voice. Askers only,
 * and only short text (the guide's own line).
 */
export async function POST(request: Request) {
  const asker = await getAsker();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!asker || !parsed.success) return new Response(null, { status: 400 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return fallback("no_key");

  const configured = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;
  const speak = (voice: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: parsed.data.text, model_id: model }),
      signal: AbortSignal.timeout(15_000),
    });
  try {
    const started = Date.now();
    let voice = configured;
    let res = await speak(voice);
    // The configured voice needs a paid plan (402): the premade default still speaks.
    if (res.status === 402 && voice !== DEFAULT_VOICE) {
      await res.body?.cancel();
      console.info(`[tts] configured voice unavailable on this plan (402); using the premade default`);
      voice = DEFAULT_VOICE;
      res = await speak(voice);
    }
    if (!res.ok || !res.body) {
      logServerError("tts.elevenlabs", `status ${res.status}`);
      return fallback(`elevenlabs_${res.status}`);
    }
    console.info(`[tts] path=elevenlabs model=${model} voice=${voice === configured ? "configured" : "default"} locale=${parsed.data.locale} ms=${Date.now() - started}`);
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-TTS-Path": "elevenlabs", "X-TTS-Model": model } });
  } catch (error) {
    logServerError("tts.elevenlabs", error);
    return fallback("elevenlabs_error");
  }
}

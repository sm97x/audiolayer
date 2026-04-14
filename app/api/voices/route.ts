import { handleOptions, jsonWithCors } from "@/lib/api";
import { getConfiguredVoiceMap, listAvailableVoices } from "@/lib/elevenlabs";

export const runtime = "nodejs";

export async function OPTIONS(): Promise<Response> {
  return handleOptions();
}

export async function GET(): Promise<Response> {
  try {
    const voices = await listAvailableVoices();

    return jsonWithCors({
      configured: getConfiguredVoiceMap(),
      voices,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown voice route error.";
    return jsonWithCors(
      {
        configured: getConfiguredVoiceMap(),
        voices: [],
        error: message,
      },
      { status: 500 },
    );
  }
}

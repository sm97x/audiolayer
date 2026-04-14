import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { MemoryCache, stableHash } from "@/lib/cache";
import type { ListenMode, PageType, PodcastScript, VoiceSummary } from "@/lib/types";

const audioCache = new MemoryCache<Buffer>(15 * 60 * 1000);
const voicesCache = new MemoryCache<VoiceSummary[]>(10 * 60 * 1000);

const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
const DEFAULT_DIALOGUE_MODEL = "eleven_v3";
const MAX_TTS_CHARACTERS = 16_000;
const MAX_DIALOGUE_CHARACTERS = 1_900;

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY. Add it to .env.local before calling audio routes.");
  }

  if (!client) {
    client = new ElevenLabsClient({ apiKey });
  }

  return client;
}

function readVoiceId(envKey: string): string {
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`Missing ${envKey}. Add a voice ID in .env.local.`);
  }

  return value;
}

function resolveNarrationVoice(pageType: PageType): string {
  if (pageType === "docs") {
    return readVoiceId("ELEVENLABS_VOICE_DOCS");
  }

  if (pageType === "thread") {
    return readVoiceId("ELEVENLABS_VOICE_THREAD");
  }

  return readVoiceId("ELEVENLABS_VOICE_NEWS");
}

function voiceSettingsFor(pageType: PageType): {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
} {
  if (pageType === "docs") {
    return {
      stability: 0.58,
      similarityBoost: 0.62,
      style: 0.08,
      speed: 0.98,
      useSpeakerBoost: true,
    };
  }

  if (pageType === "thread") {
    return {
      stability: 0.42,
      similarityBoost: 0.56,
      style: 0.24,
      speed: 1.04,
      useSpeakerBoost: true,
    };
  }

  return {
    stability: 0.5,
    similarityBoost: 0.66,
    style: 0.18,
    speed: 1.02,
    useSpeakerBoost: true,
  };
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function trimText(text: string, maxChars: number, label: string): string {
  const normalized = text.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const shortened = normalized.slice(0, maxChars);
  const lastBoundary = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("\n"),
    shortened.lastIndexOf(" "),
  );

  return shortened.slice(0, lastBoundary > 0 ? lastBoundary : maxChars).trim();
}

export async function generateTTS(params: {
  text: string;
  pageType: PageType;
  mode: Exclude<ListenMode, "podcast">;
}): Promise<{
  audio: Buffer;
  voiceId: string;
  modelId: string;
}> {
  const modelId = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_TTS_MODEL;
  const voiceId = resolveNarrationVoice(params.pageType);
  const text = trimText(params.text, MAX_TTS_CHARACTERS, "Narration text");
  const cacheKey = stableHash(
    JSON.stringify({
      text,
      pageType: params.pageType,
      mode: params.mode,
      modelId,
      voiceId,
    }),
  );

  const cachedAudio = audioCache.get(cacheKey);
  if (cachedAudio) {
    return {
      audio: cachedAudio,
      voiceId,
      modelId,
    };
  }

  try {
    const audioStream = await getClient().textToSpeech.convert(voiceId, {
      text,
      modelId,
      outputFormat: "mp3_44100_128",
      optimizeStreamingLatency: 1,
      voiceSettings: voiceSettingsFor(params.pageType),
      applyTextNormalization: "off",
      seed: 17,
    });

    const audio = await streamToBuffer(audioStream);
    audioCache.set(cacheKey, audio);

    return {
      audio,
      voiceId,
      modelId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ElevenLabs text-to-speech error.";
    throw new Error(`ElevenLabs TTS failed: ${message}`);
  }
}

export async function generatePodcastDialogue(params: {
  script: PodcastScript;
}): Promise<{
  audio: Buffer;
  modelId: string;
  voiceIds: string[];
}> {
  const modelId = process.env.ELEVENLABS_DIALOGUE_MODEL || DEFAULT_DIALOGUE_MODEL;
  const hostA = readVoiceId("ELEVENLABS_VOICE_HOST_A");
  const hostB = readVoiceId("ELEVENLABS_VOICE_HOST_B");

  const inputs = params.script.turns.map((turn) => ({
    text: trimText(turn.cue ? `${turn.cue} ${turn.text}` : turn.text, 320, "Podcast line"),
    voiceId: turn.speaker === "Host A" ? hostA : hostB,
  }));

  const totalLength = inputs.reduce((sum, input) => sum + input.text.length, 0);
  if (totalLength > MAX_DIALOGUE_CHARACTERS) {
    throw new Error(
      `Podcast script is too long for ElevenLabs dialogue generation (${totalLength} characters).`,
    );
  }

  const cacheKey = stableHash(
    JSON.stringify({
      inputs,
      modelId,
      hostA,
      hostB,
    }),
  );

  const cachedAudio = audioCache.get(cacheKey);
  if (cachedAudio) {
    return {
      audio: cachedAudio,
      modelId,
      voiceIds: [hostA, hostB],
    };
  }

  try {
    const audioStream = await getClient().textToDialogue.convert({
      inputs,
      modelId,
      outputFormat: "mp3_44100_128",
      applyTextNormalization: "off",
      seed: 17,
    });

    const audio = await streamToBuffer(audioStream);
    audioCache.set(cacheKey, audio);

    return {
      audio,
      modelId,
      voiceIds: [hostA, hostB],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ElevenLabs dialogue generation error.";
    throw new Error(`ElevenLabs dialogue generation failed: ${message}`);
  }
}

export async function listAvailableVoices(): Promise<VoiceSummary[]> {
  const cached = voicesCache.get("voices");
  if (cached) {
    return cached;
  }

  try {
    const result = await getClient().voices.search({
      pageSize: 50,
      includeTotalCount: false,
    });

    const voices = result.voices.map((voice) => ({
      voiceId: voice.voiceId,
      name: voice.name ?? "Unnamed voice",
      category: voice.category,
      previewUrl: voice.previewUrl,
      labels: voice.labels,
    }));

    voicesCache.set("voices", voices);
    return voices;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown voice lookup error.";
    throw new Error(`ElevenLabs voice lookup failed: ${message}`);
  }
}

export function getConfiguredVoiceMap(): Record<string, string | undefined> {
  return {
    article: process.env.ELEVENLABS_VOICE_NEWS,
    docs: process.env.ELEVENLABS_VOICE_DOCS,
    thread: process.env.ELEVENLABS_VOICE_THREAD,
    hostA: process.env.ELEVENLABS_VOICE_HOST_A,
    hostB: process.env.ELEVENLABS_VOICE_HOST_B,
  };
}

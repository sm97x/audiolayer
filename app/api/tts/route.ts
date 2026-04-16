import { audioWithCors, handleOptions, jsonWithCors, withCors } from "@/lib/api";
import { generateTTS } from "@/lib/elevenlabs";
import { buildBriefTranscript, buildReadTranscript, summarizePage } from "@/lib/summarize";
import { normalizeForSpeech } from "@/lib/ttsNormalize";
import type { CleanedPage, PageType, SourceHints, ThreadModel } from "@/lib/types";

export const runtime = "nodejs";

interface TtsRequestBody {
  title?: string;
  url?: string;
  pageType?: PageType;
  mode?: "brief" | "read";
  cleanedText?: string;
  headings?: string[];
  sourceHints?: SourceHints;
  threadModel?: ThreadModel;
  debug?: CleanedPage["debug"];
  responseType?: "audio" | "json";
}

function fallbackPage(body: TtsRequestBody): CleanedPage {
  const cleanedText = body.cleanedText?.trim() ?? "";
  const title = body.title?.trim() || "Untitled page";

  return {
    title,
    sourceUrl: body.url ?? "",
    pageType: body.pageType ?? "article",
    cleanedText,
    charCount: cleanedText.length,
    estimatedReadingTime: Math.max(1, Math.ceil(cleanedText.split(/\s+/).filter(Boolean).length / 190)),
    headings: body.headings ?? [],
    sourceHints: body.sourceHints,
    threadModel: body.threadModel,
    debug: body.debug ?? {
      headings: body.headings ?? [],
      removedSelectors: [],
      removedCount: 0,
      notes: [],
      segmentCount: cleanedText ? 1 : 0,
    },
  };
}

export async function OPTIONS(): Promise<Response> {
  return handleOptions();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as TtsRequestBody;

    if (!body.cleanedText || !body.mode) {
      return jsonWithCors(
        { error: "Missing cleanedText or mode in TTS request." },
        { status: 400 },
      );
    }

    if (body.mode !== "brief" && body.mode !== "read") {
      return jsonWithCors({ error: "mode must be 'brief' or 'read'." }, { status: 400 });
    }

    const page = fallbackPage(body);
    const summary = summarizePage(page);
    const rawTranscript =
      body.mode === "brief" ? buildBriefTranscript(page, summary) : buildReadTranscript(page);
    const transcript = normalizeForSpeech(rawTranscript, {
      pageType: page.pageType,
      mode: body.mode,
    });

    const { audio, voiceId, modelId } = await generateTTS({
      text: transcript,
      pageType: page.pageType,
      mode: body.mode,
    });

    if (body.responseType === "json") {
      return jsonWithCors({
        mimeType: "audio/mpeg",
        audioBase64: audio.toString("base64"),
        transcript,
        summary,
        voiceId,
        modelId,
      });
    }

    return audioWithCors(audio, {
      headers: withCors({
        "X-AudioLayer-Mode": body.mode,
        "X-AudioLayer-Page-Type": page.pageType,
        "X-AudioLayer-Voice-Id": voiceId,
        "X-AudioLayer-Transcript-Preview": encodeURIComponent(transcript.slice(0, 280)),
        "X-AudioLayer-Model-Id": modelId,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TTS route error.";
    return jsonWithCors({ error: message }, { status: 500 });
  }
}

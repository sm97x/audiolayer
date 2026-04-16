import { audioWithCors, handleOptions, jsonWithCors, withCors } from "@/lib/api";
import { generatePodcastDialogue } from "@/lib/elevenlabs";
import { createPodcastScript } from "@/lib/podcastScript";
import { summarizePage } from "@/lib/summarize";
import { normalizeForSpeech } from "@/lib/ttsNormalize";
import type { CleanedPage, PageType, SourceHints, ThreadModel } from "@/lib/types";

export const runtime = "nodejs";

interface PodcastRequestBody {
  title?: string;
  url?: string;
  cleanedText?: string;
  pageType?: PageType;
  headings?: string[];
  sourceHints?: SourceHints;
  threadModel?: ThreadModel;
  debug?: CleanedPage["debug"];
  responseType?: "audio" | "json";
}

function buildPage(body: PodcastRequestBody): CleanedPage {
  const cleanedText = body.cleanedText?.trim() ?? "";

  return {
    title: body.title?.trim() || "Untitled page",
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
    const body = (await request.json()) as PodcastRequestBody;

    if (!body.cleanedText) {
      return jsonWithCors({ error: "Missing cleanedText in podcast request." }, { status: 400 });
    }

    const page = buildPage(body);
    const summary = summarizePage(page);
    const script = createPodcastScript(page, summary);
    const normalizedTurns = script.turns.map((turn) => ({
      ...turn,
      text: normalizeForSpeech(turn.text, {
        pageType: page.pageType,
        mode: "podcast",
      }),
    }));

    const normalizedScript = {
      ...script,
      turns: normalizedTurns,
      script: normalizedTurns
        .map((turn) =>
          turn.cue ? `${turn.speaker}: ${turn.cue} ${turn.text}` : `${turn.speaker}: ${turn.text}`,
        )
        .join("\n"),
    };

    const { audio, modelId, voiceIds } = await generatePodcastDialogue({
      script: normalizedScript,
    });

    if (body.responseType === "json") {
      return jsonWithCors({
        mimeType: "audio/mpeg",
        audioBase64: audio.toString("base64"),
        script: normalizedScript.script,
        turns: normalizedScript.turns,
        summary,
        modelId,
        voiceIds,
      });
    }

    return audioWithCors(audio, {
      headers: withCors({
        "X-AudioLayer-Page-Type": page.pageType,
        "X-AudioLayer-Model-Id": modelId,
        "X-AudioLayer-Transcript-Preview": encodeURIComponent(normalizedScript.script.slice(0, 280)),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown podcast route error.";
    return jsonWithCors({ error: message }, { status: 500 });
  }
}

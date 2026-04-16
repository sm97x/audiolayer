import { jsonWithCors, handleOptions } from "@/lib/api";
import { classifyAndExtractPage } from "@/lib/extract";
import type { PagePayload } from "@/lib/types";

export const runtime = "nodejs";

interface ClassifyRequestBody extends Partial<PagePayload> {
  includeDebug?: boolean;
}

export async function OPTIONS(): Promise<Response> {
  return handleOptions();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ClassifyRequestBody;
    const includeDebug =
      body.includeDebug === true ||
      new URL(request.url).searchParams.get("includeDebug") === "true";

    if (!body.url) {
      return jsonWithCors({ error: "Missing url in request body." }, { status: 400 });
    }

    if (!body.html && !body.textContent) {
      return jsonWithCors(
        { error: "Provide either html or textContent for classification." },
        { status: 400 },
      );
    }

    const result = classifyAndExtractPage({
      url: body.url,
      html: body.html,
      textContent: body.textContent,
      title: body.title,
    });

    const publicResponse = {
      title: result.cleaned.title,
      pageType: result.classification.pageType,
      cleanedText: result.cleaned.cleanedText,
      headings: result.cleaned.headings,
      summaryPreview: result.summary.shortSummary,
      takeaways: result.summary.takeaways,
      whyThisMatters: result.summary.whyThisMatters,
    };

    if (!includeDebug) {
      return jsonWithCors(publicResponse);
    }

    return jsonWithCors({
      ...publicResponse,
      debug: {
        confidence: result.classification.confidence,
        reasons: result.classification.reasons,
        scores: result.classification.scores,
        cleanedCharCount: result.cleaned.charCount,
        estimatedReadingTime: result.cleaned.estimatedReadingTime,
        extraction: result.cleaned.debug,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown classification error.";
    return jsonWithCors({ error: message }, { status: 500 });
  }
}

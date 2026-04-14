import { jsonWithCors, handleOptions } from "@/lib/api";
import { classifyAndExtractPage } from "@/lib/extract";
import type { PagePayload } from "@/lib/types";

export const runtime = "nodejs";

export async function OPTIONS(): Promise<Response> {
  return handleOptions();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<PagePayload>;

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

    return jsonWithCors({
      title: result.cleaned.title,
      pageType: result.classification.pageType,
      confidence: result.classification.confidence,
      reasons: result.classification.reasons,
      scores: result.classification.scores,
      cleanedText: result.cleaned.cleanedText,
      cleanedCharCount: result.cleaned.charCount,
      estimatedReadingTime: result.cleaned.estimatedReadingTime,
      headings: result.cleaned.headings,
      debug: result.cleaned.debug,
      summaryPreview: result.summary.shortSummary,
      takeaways: result.summary.takeaways,
      whyThisMatters: result.summary.whyThisMatters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown classification error.";
    return jsonWithCors({ error: message }, { status: 500 });
  }
}

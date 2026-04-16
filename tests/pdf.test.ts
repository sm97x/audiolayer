import { describe, expect, it } from "vitest";
import { extractPdfFromBuffer } from "@/lib/pdf";
import { classifyPage } from "@/lib/page-type";
import { cleanDocs } from "@/lib/extract/cleanDocs";
import { buildBriefTranscript, buildReadTranscript, summarizePage } from "@/lib/summarize";

function makeMinimalPdf(text: string): Buffer {
  const escaped = text.replace(/[\\()]/g, "\\$&");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${`BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`.length} >>\nstream\nBT /F1 18 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body);
}

describe("PDF ingestion", () => {
  it("extracts text from a PDF buffer and feeds the docs flow", async () => {
    const extracted = await extractPdfFromBuffer(
      makeMinimalPdf("AudioLayer PDF quickstart explains setup, constraints, and how to generate audio from a document."),
      "AudioLayer PDF quickstart",
    );

    expect(extracted.text).toMatch(/PDF quickstart explains setup/i);

    const classification = classifyPage({
      url: "https://example.com/guides/audiolayer-quickstart.pdf",
      title: extracted.title,
      textContent: extracted.text,
      sourceHints: {
        sourceKind: "pdf",
        pageIntentHint: "docs",
      },
    });

    expect(classification.pageType).toBe("docs");
    expect(classification.sourceHints.sourceKind).toBe("pdf");

    const page = cleanDocs({
      url: "https://example.com/guides/audiolayer-quickstart.pdf",
      title: extracted.title,
      textContent: extracted.text,
      sourceHints: classification.sourceHints,
    });
    const summary = summarizePage(page);

    expect(buildBriefTranscript(page, summary)).toMatch(/setup|constraints|generate audio/i);
    expect(buildReadTranscript(page)).not.toMatch(/^Read it mode/i);
  });
});

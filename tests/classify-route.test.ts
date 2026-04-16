import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/classify/route";

const articlePayload = {
  url: "https://example.com/article",
  title: "Town opens new library after year of construction",
  html: `
    <article>
      <h1>Town opens new library after year of construction</h1>
      <p>The town opened its new library on Monday after a year of construction and planning.</p>
      <p>The building includes a children's room, quiet study space, and a small cafe for visitors.</p>
      <p>Council leaders said the project was designed to bring more services into the town centre.</p>
    </article>
  `,
};

describe("/api/classify", () => {
  it("returns a slim public response by default", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/classify", {
        method: "POST",
        body: JSON.stringify(articlePayload),
      }),
    );
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data).toMatchObject({
      title: articlePayload.title,
      pageType: "article",
    });
    expect(data.cleanedText).toContain("The town opened its new library");
    expect(data.summaryPreview).toBeTruthy();
    expect(data.takeaways).toBeInstanceOf(Array);
    expect(data.whyThisMatters).toBeTruthy();
    expect(data).not.toHaveProperty("confidence");
    expect(data).not.toHaveProperty("reasons");
    expect(data).not.toHaveProperty("scores");
    expect(data).not.toHaveProperty("cleanedCharCount");
    expect(data).not.toHaveProperty("debug");
  });

  it("returns developer details only when requested", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/classify", {
        method: "POST",
        body: JSON.stringify({
          ...articlePayload,
          includeDebug: true,
        }),
      }),
    );
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.debug.confidence).toEqual(expect.any(Number));
    expect(data.debug.reasons).toBeInstanceOf(Array);
    expect(data.debug.extraction.notes).toBeInstanceOf(Array);
  });
});

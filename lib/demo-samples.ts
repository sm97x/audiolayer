import type { PageType } from "@/lib/types";

export interface DemoSample {
  id: string;
  label: string;
  pageType: PageType;
  title: string;
  blurb: string;
  html: string;
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "article",
    label: "Article",
    pageType: "article",
    title: "Why better web audio starts with the page",
    blurb:
      "A short article about turning busy webpages into something worth listening to.",
    html: `
      <article class="article-body">
        <header>
          <h1>Why better web audio starts with the page</h1>
          <p class="dek">Voice interfaces work best when they know what matters and what can be skipped.</p>
          <p class="byline">By Maya Fernandez</p>
        </header>
        <p>Most webpages are written for people who are looking at a screen. A straight read-aloud experience carries over menus, repeated calls to action, sidebars, captions, and paragraphs that were meant to be skimmed. The result may be audio, but it still feels like work.</p>
        <p>Better web audio starts by asking what kind of page this is. An article needs the main point and supporting detail. A docs page needs the steps in order. A thread needs the original post and the replies that add something new.</p>
        <h2>The page already has clues</h2>
        <p>Headings, paragraphs, lists, code blocks, and repeated reply sections all help show how the page should be heard. When those signals are used well, the audio feels calmer and more useful.</p>
        <p>That shift matters for product quality. A brief can front-load the point. A full read can keep the body intact without the clutter. A podcast recap can turn a dense page into a short conversation that is easier to follow.</p>
        <h2>Less noise, more signal</h2>
        <p>People do not want every part of the page converted into sound. They want the useful layer above it: the story, the steps, or the discussion without the parts that were never meant to be heard.</p>
        <footer>Related stories and newsletter signup</footer>
      </article>
    `,
  },
  {
    id: "docs",
    label: "Docs",
    pageType: "docs",
    title: "Render endpoint quickstart",
    blurb:
      "A documentation page with headings, lists, and code examples.",
    html: `
      <main class="docs-content">
        <nav class="sidebar">On this page</nav>
        <article>
          <h1>Render endpoint quickstart</h1>
          <p>The render endpoint turns normalized page scripts into audio. Use it when you want a single request for summary-first narration or cleaned full-text playback.</p>
          <h2>Before you start</h2>
          <ul>
            <li>Create an API key in the dashboard.</li>
            <li>Choose a voice that matches your content type.</li>
            <li>Keep your request under the model context limit.</li>
          </ul>
          <h2>Request</h2>
          <p>Send a JSON payload with a title, page type, mode, and cleaned text body.</p>
          <pre><code>POST /v1/render
{
  "title": "Shipping voice layers",
  "pageType": "article",
  "mode": "brief"
}</code></pre>
          <h2>Response</h2>
          <p>The service responds with an MPEG audio stream. For local product demos, you can also request JSON that includes base64 audio and transcript metadata.</p>
          <pre><code>{
  "mimeType": "audio/mpeg",
  "audioBase64": "..."
}</code></pre>
          <h3>Notes</h3>
          <p>Inline code like renderAudio should stay terse when spoken. Large code samples are better replaced with a spoken placeholder so the listener can stay oriented.</p>
        </article>
      </main>
    `,
  },
  {
    id: "thread",
    label: "Thread",
    pageType: "thread",
    title: "Founder thread: would you listen to docs on your commute?",
    blurb:
      "A discussion thread with an original post and a few useful replies.",
    html: `
      <main class="discussion-thread">
        <section class="thread-header">
          <h1>Founder thread: would you listen to docs on your commute?</h1>
          <p>@aria posted 2 hours ago</p>
          <p>I keep bookmarking product docs and technical explainers, then never getting back to them. I'm wondering whether an adaptive audio layer would actually change that, or whether people only want short summaries and nothing longer. Curious how you'd want it to behave on articles versus API docs versus a busy forum thread.</p>
        </section>
        <section class="replies">
          <article class="reply">
            <p class="author">@kevin</p>
            <time>1 hour ago</time>
            <p>I would absolutely use it for docs if it preserved the section hierarchy and skipped the code blocks. I do not want code read out line by line, but I do want to hear the setup steps, caveats, and common gotchas.</p>
          </article>
          <article class="reply">
            <p class="author">@lina</p>
            <time>58 minutes ago</time>
            <p>For article pages, the killer feature is a trustworthy brief mode. Give me the thesis, the evidence, and why it matters in under a minute. If I like the summary, then I can switch to a full listen.</p>
          </article>
          <article class="reply">
            <p class="author">@omar</p>
            <time>44 minutes ago</time>
            <p>Threads are where this gets interesting. The original post usually matters, but most replies are repetitive. I'd want the top replies, not every single reaction.</p>
          </article>
        </section>
        <aside class="related">Related communities and recommended users</aside>
      </main>
    `,
  },
];

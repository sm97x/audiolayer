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
    title: "Why the next audio product is context-aware, not generic narration",
    blurb:
      "A magazine-style article about turning pages into audio experiences that understand structure, signal, and pacing.",
    html: `
      <article class="article-body">
        <header>
          <h1>Why the next audio product is context-aware, not generic narration</h1>
          <p class="dek">Voice interfaces feel magical when they understand what matters, what can be skipped, and how a page should sound.</p>
          <p class="byline">By Maya Fernandez</p>
        </header>
        <p>Most of the web is still designed to be scanned with your eyes. A literal read-aloud experience inherits every awkward part of that design: navigation chrome, repetitive calls to action, sidebars, caption fragments, and paragraphs that were written to be skimmed rather than heard. The result is technically functional audio that still feels like work.</p>
        <p>The more interesting product direction is adaptive audio. That means detecting whether a page is an article, documentation, or a discussion thread, then restructuring the content before a single second of audio is generated. A good voice layer should know that an article needs a summary-first path, docs need clearer section scaffolding, and a thread should preserve the original post plus only the strongest replies.</p>
        <h2>The page itself is the prompt</h2>
        <p>In practice, the web page already contains most of the cues a voice system needs. Heading density, repeated reply blocks, code fences, side navigation, and timestamp patterns all tell you what kind of page you are on. Those cues are deterministic, inspectable, and fast. They also make the product easier to trust because the user can understand why the system made a choice.</p>
        <p>That shift matters for product quality. Once the experience is grounded in structure, the audio can become much more intentional. A brief mode can front-load the thesis and consequences. A read mode can keep the body intact but remove the noise. A two-host podcast mode can turn dense pages into a short recap that feels like a smart colleague explaining what is worth your time.</p>
        <h2>Less content, more signal</h2>
        <p>Users do not want a blind conversion of the DOM into sound. They want the useful layer that sits on top of the page. If the experience gets the page type right, trims the fluff, and chooses a voice that matches the material, the audio version starts to feel like a product rather than a utility.</p>
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
      "A documentation page with section headings, lists, and code blocks so the cleaner can turn it into a listenable version.",
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
      "A discussion thread with an original post and layered replies that should be compressed into the original point plus the strongest responses.",
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
            <p>Threads are where this gets interesting. The original post usually matters, but most replies are repetitive. I'd want the top replies, not every single reaction, and I would want the system to tell me what fluff it intentionally removed.</p>
          </article>
        </section>
        <aside class="related">Related communities and recommended users</aside>
      </main>
    `,
  },
];

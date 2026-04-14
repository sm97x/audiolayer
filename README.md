# AudioLayer

AudioLayer is a portfolio-quality v1 prototype for the idea of "the voice layer for the internet."

It is a Chrome extension plus a Next.js backend that turns a webpage into an adaptive audio experience. It does not use a remote LLM. Instead, it classifies the page, cleans it, summarizes it locally with deterministic heuristics, and only sends the final script to ElevenLabs for voice generation.

## Why this is a strong ElevenLabs showcase

- It demonstrates page understanding before generation, not just basic TTS.
- It uses different listening modes that show product thinking around voice UX.
- It keeps all ElevenLabs calls server-side, which is the correct security model for an extension-backed product.
- It uses both single-voice narration and multi-voice dialogue through the official ElevenLabs JavaScript SDK.
- It is narrow enough to feel believable as a v1, but polished enough to be shown in an application or interview.

## Features

- Deterministic page classification: `article`, `docs`, or `thread`
- Page-type-specific cleaning:
  - articles: title, dek, byline, body, subheads
  - docs: sections, bullets, prose, code-block placeholders
  - threads: original post plus top replies
- Listening modes:
  - `Brief me`: 45 to 90 second summary-first audio
  - `Read it`: cleaned full-content narration
  - `Podcast mode`: short 2-host recap
- Local summarization:
  - title and heading overlap
  - term frequency
  - paragraph position
  - sentence uniqueness
- TTS normalization for dates, percentages, currency, ordinals, and a few common abbreviations
- ElevenLabs integration with:
  - page-type voice mapping
  - dialogue voice mapping
  - small in-memory audio cache
- Chrome extension popup with:
  - detected page type
  - confidence
  - cleaned character count
  - audio player
  - transcript/debug panel
- `/demo` page with built-in article, docs, and thread examples
- Tests for classifier, cleaners, summarizer, podcast script generation, and normalization

## Architecture

### Web app / backend

- Next.js App Router
- Route handlers under `app/api/*`
- Tailwind CSS
- TypeScript

### Browser extension

- Chrome Extension Manifest V3
- Plain JavaScript, HTML, and CSS
- Calls the Next.js backend for classification and audio generation

### Core pipeline

1. The content script captures the current tab's `url`, `title`, `html`, and visible text.
2. `POST /api/classify` runs deterministic DOM heuristics and page-type-specific cleaners.
3. Local summarization or podcast templating creates the spoken script.
4. `POST /api/tts` or `POST /api/podcast` normalizes the text and calls ElevenLabs server-side.
5. The extension popup or `/demo` page plays the resulting MP3 and shows transcript/debug output.

## Repo structure

```text
/
  app/
    page.tsx
    demo/page.tsx
    api/
      classify/route.ts
      tts/route.ts
      podcast/route.ts
      voices/route.ts
  components/
  lib/
    page-type.ts
    extract/
      cleanArticle.ts
      cleanDocs.ts
      cleanThread.ts
      common.ts
      index.ts
    summarize.ts
    podcastScript.ts
    ttsNormalize.ts
    cache.ts
    elevenlabs.ts
    types.ts
    demo-samples.ts
  extension/
    manifest.json
    popup.html
    popup.css
    popup.js
    content.js
    background.js
    options.html
    options.js
  scripts/
    list-voices.mjs
  tests/
  .env.example
  README.md
```

## Exact local setup

### 1. Prerequisites

- Node.js 18+ installed
- npm available
- A Chrome or Chromium browser
- An ElevenLabs account and API key

### 2. Install dependencies

```bash
npm install
```

### 3. Create your local env file

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local`:

```env
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_DIALOGUE_MODEL=eleven_v3
ELEVENLABS_VOICE_NEWS=voice_id_for_articles
ELEVENLABS_VOICE_DOCS=voice_id_for_docs
ELEVENLABS_VOICE_THREAD=voice_id_for_threads
ELEVENLABS_VOICE_HOST_A=voice_id_for_podcast_host_a
ELEVENLABS_VOICE_HOST_B=voice_id_for_podcast_host_b
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:3000
```

## Exact ElevenLabs setup

### 1. Generate an API key

- Open your ElevenLabs dashboard.
- Create or copy an API key.
- Put it in `ELEVENLABS_API_KEY`.

### 2. Choose voices

You need five voice IDs:

- `ELEVENLABS_VOICE_NEWS`
- `ELEVENLABS_VOICE_DOCS`
- `ELEVENLABS_VOICE_THREAD`
- `ELEVENLABS_VOICE_HOST_A`
- `ELEVENLABS_VOICE_HOST_B`

Suggested mapping:

- `VOICE_NEWS`: confident, concise, newsroom-like
- `VOICE_DOCS`: clear, neutral, steady
- `VOICE_THREAD`: conversational, lighter
- `HOST_A`: lead host
- `HOST_B`: reacting / clarifying host

### 3. How to get voice IDs

Run:

```bash
npm run list:voices
```

That script reads `.env.local`, calls ElevenLabs, and prints a voice table with `voiceId`, `name`, `category`, and `previewUrl`.

You can also use:

- `GET /api/voices`

to verify both your configured IDs and the simplified voice list exposed by the backend.

## How to run the web app

Start the Next.js app:

```bash
npm run dev
```

Then open:

- Landing page: [http://localhost:3000](http://localhost:3000)
- Interactive demo: [http://localhost:3000/demo](http://localhost:3000/demo)

## How to load the extension in Chrome

1. Start the Next.js app with `npm run dev`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `extension/` folder in this repo.
6. Pin the AudioLayer extension.
7. Open the extension options page and confirm the backend URL is `http://localhost:3000`.
8. Visit any article, docs page, or discussion thread.
9. Open the popup and generate:
   - Brief me
   - Read it
   - Podcast mode

## How to test

Run the core tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Build the app:

```bash
npm run build
```

## Demo flow for recording a video

This repo is built to support a short application video.

### Suggested 90-second script

1. Start on the landing page and say:
   "This is AudioLayer, a prototype for the voice layer for the internet."
2. Open `/demo` and show the three built-in page types:
   - article
   - docs
   - thread
3. Click the article sample and run `Brief me`.
4. Point out:
   - detected page type
   - confidence
   - cleaned character count
   - summary-first audio
5. Switch to the docs sample and run `Read it`.
6. Call out that code blocks are replaced with a spoken placeholder.
7. Switch to the thread sample and run `Podcast mode`.
8. Explain that the two-host script is locally templated and only the final dialogue is sent to ElevenLabs.
9. End by showing the extension popup on a real webpage and say:
   "The same pipeline runs from the extension, with the API key kept server-side."

## Product choices and tradeoffs

- No external LLM APIs:
  - all classification, cleaning, summarization, and dialogue scripting are local and deterministic
- No persistence:
  - no database, auth, or user history
- Heuristics over learned ranking:
  - better for a self-contained prototype
  - easier to debug in an interview
- Docs code handling is intentionally opinionated:
  - code blocks are omitted from narration rather than read literally
- Thread compression is deliberately tight:
  - the prototype favors signal over exhaustive coverage

## Limitations

- Classification is heuristic and can miss unusual site structures.
- Thread extraction is tuned for common discussion patterns, not every social layout on the web.
- Read mode can still sound dense on very long or poorly structured pages.
- No chaptering, sentence-level timestamps, or resumable playback yet.
- In-memory caching resets on server restart.

## Future roadmap

- Better site-specific heuristics for major publishers, docs frameworks, and social products
- Streaming audio playback in the extension
- Richer spoken transforms for tables, quotes, and inline code
- Sentence timestamps and clickable transcript sync
- Saved listening queue across tabs
- Per-user voice presets and mode preferences
- A stronger design pass for extension iconography and onboarding

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:watch
npm run list:voices
```

## Notes for reviewers

- The repo is intentionally self-contained.
- ElevenLabs is the only third-party API.
- The most important files to inspect are:
  - `lib/page-type.ts`
  - `lib/extract/*`
  - `lib/summarize.ts`
  - `lib/podcastScript.ts`
  - `lib/ttsNormalize.ts`
  - `lib/elevenlabs.ts`
  - `extension/popup.js`

# AudioLayer

AudioLayer turns articles, docs, and threads into audio. It can give you a quick summary, read the page properly, or turn it into a short podcast-style recap.

The Chrome extension inspects the current page and calls a Next.js backend. The backend prepares the transcript and calls ElevenLabs from the server, so your API key never lives in the extension.

## What it does

- Turns articles, documentation pages, and discussion threads into audio.
- Supports three modes: Brief me, Read it, and Podcast mode.
- Removes common webpage clutter before generating audio.
- Handles public PDFs by extracting text on the backend before preparing audio.
- Uses ElevenLabs for single-voice narration and two-voice podcast recaps.
- Includes a demo page with sample article, docs, and thread content.

## How Modes Work

AudioLayer separates the kind of page from the way it is played back.

- Page types: article, docs, thread. PDFs are ingested first, then treated like docs or article-style documents.
- Brief me: single-voice summary.
- Read it: single-voice body narration.
- Podcast mode: two-host recap.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Chrome Extension Manifest V3
- ElevenLabs JavaScript SDK
- pdf-parse
- Vitest

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in `.env.local` with your ElevenLabs API key and voice IDs.

## Environment Variables

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

To list available voices:

```bash
npm run list:voices
```

You can also call `GET /api/voices` while the app is running.

## Run the Web App

Start the local server:

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)
- [http://localhost:3000/demo](http://localhost:3000/demo)

Use `/demo` first to confirm your ElevenLabs key and voice IDs work.

## Install the Chrome extension

The live web app is deployed at [https://audiolayer-delta.vercel.app](https://audiolayer-delta.vercel.app). Once the extension zip is installed, you can try AudioLayer without running this repo locally.

1. Download the latest `audiolayer-extension.zip` from GitHub Releases.
2. Unzip the file.
3. Open `chrome://extensions` in Chrome.
4. Enable Developer mode.
5. Click `Load unpacked`.
6. Select the unzipped `extension` folder.
7. Open the extension settings and confirm the backend URL is `https://audiolayer-delta.vercel.app`.

## Load the Extension

1. Run the web app with `npm run dev`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the `extension/` folder in this repo.
6. Pin AudioLayer.
7. Open the extension settings and confirm the backend URL is `http://localhost:3000`.
8. Visit an article, docs page, or discussion thread.
9. Open the popup and choose Brief me, Read it, or Podcast mode.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:watch
npm run list:voices
```

## Project Structure

```text
app/                 Next.js pages and API routes
components/          Landing page and demo UI
extension/           Chrome extension files
lib/                 Page cleanup, summaries, podcast scripts, ElevenLabs calls
scripts/             Utility scripts
tests/               Vitest coverage for core logic
```

## API Routes

- `POST /api/classify` prepares a page and returns the public page result.
- `POST /api/tts` creates audio for Brief me and Read it.
- `POST /api/podcast` creates a two-host recap.
- `GET /api/voices` lists configured and available ElevenLabs voices.

`/api/classify` returns a slim response by default. Pass `includeDebug: true` in the request body if you want internal notes for local development.

## Limitations

- Page cleanup is rule-based and will not handle every publisher layout perfectly.
- Very long pages are shortened into a practical transcript before audio generation.
- Code blocks are summarized for audio instead of read line by line.
- X/Twitter extraction is best effort because public markup changes often.
- PDFs must be reachable by the backend, or the extension needs selected/visible text as a fallback.
- There is no login, database, history, or cross-device queue.
- Audio is generated after each request rather than streamed sentence by sentence.

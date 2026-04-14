import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const cwd = process.cwd();

for (const envFile of [".env.local", ".env"]) {
  const fullPath = path.join(cwd, envFile);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: envFile === ".env.local" });
  }
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY. Add it to .env.local before running npm run list:voices.");
  process.exit(1);
}

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const result = await client.voices.search({
  pageSize: 50,
  includeTotalCount: false,
});

console.table(
  result.voices.map((voice) => ({
    voiceId: voice.voiceId,
    name: voice.name ?? "Unnamed voice",
    category: voice.category ?? "",
    previewUrl: voice.previewUrl ?? "",
  })),
);

import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIR = path.join(REPO_ROOT, 'public/models/piper-tts');
const PIPER_VOICES_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';
const PIPER_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

const VOICES = [
  { id: 'en_US-lessac-low', family: 'en', language: 'en_US', speaker: 'lessac', quality: 'low' },
  { id: 'en_US-lessac-medium', family: 'en', language: 'en_US', speaker: 'lessac', quality: 'medium' },
  { id: 'en_US-amy-low', family: 'en', language: 'en_US', speaker: 'amy', quality: 'low' },
  { id: 'en_US-amy-medium', family: 'en', language: 'en_US', speaker: 'amy', quality: 'medium' },
  { id: 'en_US-kathleen-low', family: 'en', language: 'en_US', speaker: 'kathleen', quality: 'low' },
  { id: 'en_US-hfc_female-medium', family: 'en', language: 'en_US', speaker: 'hfc_female', quality: 'medium' },
  { id: 'en_US-hfc_male-medium', family: 'en', language: 'en_US', speaker: 'hfc_male', quality: 'medium' },
  { id: 'en_GB-alba-medium', family: 'en', language: 'en_GB', speaker: 'alba', quality: 'medium' },
  { id: 'en_GB-cori-medium', family: 'en', language: 'en_GB', speaker: 'cori', quality: 'medium' },
];

const ensureParentDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const downloadFile = async (relativePath, url) => {
  const destination = path.join(TARGET_DIR, relativePath);
  const tempDestination = `${destination}.tmp`;
  await ensureParentDir(destination);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempDestination));
  await fs.rename(tempDestination, destination);
  console.log(`Synced ${relativePath}`);
};

await fs.mkdir(TARGET_DIR, { recursive: true });

await downloadFile('wasm/piper_phonemize.wasm', `${PIPER_WASM_BASE_URL}.wasm`);
await downloadFile('wasm/piper_phonemize.data', `${PIPER_WASM_BASE_URL}.data`);

for (const voice of VOICES) {
  const remoteBase = `${PIPER_VOICES_BASE_URL}/${voice.family}/${voice.language}/${voice.speaker}/${voice.quality}/${voice.id}`;
  const localBase = `voices/${voice.id}/${voice.id}`;
  await downloadFile(`${localBase}.onnx`, `${remoteBase}.onnx`);
  await downloadFile(`${localBase}.onnx.json`, `${remoteBase}.onnx.json`);
}

console.log('Piper local assets are ready.');

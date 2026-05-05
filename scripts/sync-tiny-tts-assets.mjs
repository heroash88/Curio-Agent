import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIR = path.join(REPO_ROOT, 'public/models/tiny-tts');
const MODEL_BASE_URL = 'https://huggingface.co/backtracking/tiny-tts/resolve/main';
const NPM_TARBALL_URL = 'https://registry.npmjs.org/tiny-tts/-/tiny-tts-5.0.1.tgz';

const DOWNLOADS = [
  ['tinytts.onnx', `${MODEL_BASE_URL}/tinytts.onnx`],
  ['config.json', `${MODEL_BASE_URL}/config.json`],
];

const ensureParentDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const downloadFile = async (relativePath, url, options = {}) => {
  const destination = path.join(TARGET_DIR, relativePath);
  const tempDestination = `${destination}.tmp`;
  await ensureParentDir(destination);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempDestination));
  await fs.rename(tempDestination, destination);
  if (!options.silent) {
    console.log(`Synced ${relativePath}`);
  }
};

const readTarMembers = async (archivePath) => {
  const { gunzip } = await import('node:zlib');
  const archive = await fs.readFile(archivePath);
  const buffer = await new Promise((resolve, reject) => {
    gunzip(archive, (error, result) => error ? reject(error) : resolve(result));
  });
  const members = new Map();

  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    if (!name) break;

    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/u, '').trim();
    const size = Number.parseInt(sizeOctal || '0', 8);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    members.set(name, buffer.subarray(bodyStart, bodyEnd));
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }

  return members;
};

const writeTarMember = async (members, memberName, destinationName) => {
  const body = members.get(`package/${memberName}`);
  if (!body) {
    throw new Error(`Could not find package/${memberName} in tiny-tts tarball.`);
  }

  const destination = path.join(TARGET_DIR, destinationName);
  await ensureParentDir(destination);
  await fs.writeFile(destination, body);
  console.log(`Synced ${destinationName}`);
};

await fs.mkdir(TARGET_DIR, { recursive: true });

for (const [relativePath, url] of DOWNLOADS) {
  await downloadFile(relativePath, url);
}

const tempTarball = path.join(TARGET_DIR, '.tiny-tts.tgz.tmp');
await downloadFile('.tiny-tts.tgz.tmp', NPM_TARBALL_URL, { silent: true });
const tarMembers = await readTarMembers(tempTarball);
await writeTarMember(tarMembers, 'cmudict.json', 'cmudict.json');
await writeTarMember(tarMembers, 'g2p_model.json', 'g2p_model.json');
await fs.rm(tempTarball, { force: true });

console.log('TinyTTS local assets are ready.');

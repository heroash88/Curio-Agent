/**
 * Minimal .npz (zipped .npy) reader for Kitten TTS voices.
 *
 * Each .npz is a ZIP archive of .npy files, one per voice. Each .npy is a
 * 2D float32 matrix of shape [N, 256] -- the voice "style" embedding that
 * varies by utterance length.
 *
 * We only need the subset of NPY we actually see in Kitten TTS exports:
 * little-endian, C-order, f4/f8. Keeping the parser small on purpose.
 */

import { unzipSync } from "fflate";

export interface VoiceMatrix {
    rows: number;
    cols: number;
    values: Float32Array;
}

export type VoiceTable = Record<string, VoiceMatrix>;

const NUMPY_MAGIC = "\u0093NUMPY";

export const parseVoicesNpz = (buffer: ArrayBuffer): VoiceTable => {
    const entries = unzipSync(new Uint8Array(buffer));
    const voices: VoiceTable = {};

    for (const [filename, bytes] of Object.entries(entries)) {
        if (!filename.endsWith(".npy")) continue;
        const name = filename.replace(/^.*\//, "").replace(/\.npy$/, "");
        const parsed = parseNpy(bytes);
        if (parsed.shape.length !== 2) {
            throw new Error(`Voice ${filename} is not 2D.`);
        }
        const [rows, cols] = parsed.shape;
        voices[name] = { rows, cols, values: parsed.data };
    }

    if (Object.keys(voices).length === 0) {
        throw new Error("No .npy arrays found in voices.npz.");
    }
    return voices;
};

const parseNpy = (bytes: Uint8Array): { shape: number[]; data: Float32Array } => {
    const magic = String.fromCharCode(...bytes.subarray(0, 6));
    if (magic !== NUMPY_MAGIC) throw new Error("Not an NPY file.");

    const major = bytes[6];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    const headerOffset = major === 1 ? 10 : 12;
    const headerEnd = headerOffset + headerLength;
    const header = new TextDecoder("ascii").decode(bytes.subarray(headerOffset, headerEnd));

    const descrMatch = /'descr'\s*:\s*'([^']+)'/.exec(header);
    const shapeMatch = /'shape'\s*:\s*\(([^)]*)\)/.exec(header);
    const fortranMatch = /'fortran_order'\s*:\s*(True|False)/.exec(header);

    if (!descrMatch || !shapeMatch || !fortranMatch) {
        throw new Error("Invalid NPY header.");
    }
    if (fortranMatch[1] === "True") {
        throw new Error("Fortran-order NPY not supported.");
    }

    const descr = descrMatch[1];
    const shape = shapeMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseInt(s, 10));

    const elementCount = shape.reduce((a, b) => a * b, 1);
    const dataOffset = headerEnd;

    // We only encounter f4 (float32) and f8 (float64) in Kitten voices.
    const dtype = descr.slice(1);
    if (dtype === "f4") {
        // Make a copy -- worker message passing expects an owned buffer.
        const view32 = new Float32Array(
            bytes.buffer,
            bytes.byteOffset + dataOffset,
            elementCount,
        );
        return { shape, data: new Float32Array(view32) };
    }
    if (dtype === "f8") {
        const view64 = new Float64Array(
            bytes.buffer,
            bytes.byteOffset + dataOffset,
            elementCount,
        );
        return { shape, data: Float32Array.from(view64) };
    }
    throw new Error(`Unsupported NPY dtype '${descr}'.`);
};

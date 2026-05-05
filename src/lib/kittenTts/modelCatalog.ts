/**
 * Kitten TTS model catalog. Three variants, bundled in
 * public/models/kitten-tts/{nano,micro,mini}/.
 *
 * All three use the same voice aliases (the friendly names published by
 * KittenML) and the same expected voice keys in their voices.npz files.
 * We keep them in code so the engine can preload voice labels before the
 * matching .npz has been fetched.
 */

export type KittenModelId = "nano" | "micro" | "mini";

export interface KittenModelInfo {
    id: KittenModelId;
    label: string;
    description: string;
    params: string;
    sizeMB: number;
    runtime: "wasm" | "wasm-or-webgpu";
    basePath: string;
}

export const KITTEN_MODELS: Record<KittenModelId, KittenModelInfo> = {
    nano: {
        id: "nano",
        label: "Nano (15M)",
        description: "Lowest footprint. Best fallback for very constrained devices.",
        params: "15M",
        sizeMB: 56,
        runtime: "wasm-or-webgpu", // fp32, WebGPU-capable
        basePath: "/models/kitten-tts/nano",
    },
    micro: {
        id: "micro",
        label: "Micro (40M)",
        description: "Recommended default. Better quality than Nano while still small enough for Safari on iPhone and laptops.",
        params: "40M",
        sizeMB: 41,
        runtime: "wasm", // int8 quantized ops not supported on WebGPU EP
        basePath: "/models/kitten-tts/micro",
    },
    mini: {
        id: "mini",
        label: "Mini (80M)",
        description: "Highest quality. Needs a desktop or powerful laptop.",
        params: "80M",
        sizeMB: 78,
        runtime: "wasm",
        basePath: "/models/kitten-tts/mini",
    },
};

export const DEFAULT_KITTEN_MODEL: KittenModelId = "micro";

// Friendly name -> internal voice key (matches entries in voices.npz).
// These are the same for all three models.
export const KITTEN_VOICE_ALIASES: Record<string, string> = {
    Bella: "expr-voice-2-f",
    Jasper: "expr-voice-2-m",
    Luna: "expr-voice-3-f",
    Bruno: "expr-voice-3-m",
    Rosie: "expr-voice-4-f",
    Hugo: "expr-voice-4-m",
    Kiki: "expr-voice-5-f",
    Leo: "expr-voice-5-m",
};

export const KITTEN_VOICE_NAMES = Object.keys(KITTEN_VOICE_ALIASES);
export const DEFAULT_KITTEN_VOICE = "Bella";

export const isKittenModelId = (value: unknown): value is KittenModelId =>
    value === "nano" || value === "micro" || value === "mini";

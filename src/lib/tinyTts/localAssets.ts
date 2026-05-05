export const TINY_TTS_LOCAL_MODEL_PATH = '/models/tiny-tts';

export const TINY_TTS_ASSETS = {
    config: `${TINY_TTS_LOCAL_MODEL_PATH}/config.json`,
    model: `${TINY_TTS_LOCAL_MODEL_PATH}/tinytts.onnx`,
    cmuDict: `${TINY_TTS_LOCAL_MODEL_PATH}/cmudict.json`,
    g2pModel: `${TINY_TTS_LOCAL_MODEL_PATH}/g2p_model.json`,
} as const;

const headOk = async (url: string): Promise<boolean> => {
    try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) return true;

        // Some static hosts do not implement HEAD correctly. Fall back to a
        // tiny byte request so the readiness check still works in dev/preview.
        const fallback = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: { Range: 'bytes=0-0' },
        });
        return fallback.ok || fallback.status === 206;
    } catch {
        return false;
    }
};

export const assertTinyTtsLocalAssetsAvailable = async (): Promise<void> => {
    const entries = Object.entries(TINY_TTS_ASSETS);
    const missing: string[] = [];

    await Promise.all(entries.map(async ([name, url]) => {
        if (!(await headOk(url))) missing.push(`${name}: ${url}`);
    }));

    if (missing.length > 0) {
        throw new Error(
            `Missing local TinyTTS assets: ${missing.join(', ')}. Run npm run sync:tiny-tts-assets to restore them.`,
        );
    }
};

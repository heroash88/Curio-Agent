import { TINY_TTS_ASSETS } from './localAssets';

interface EncodedTensor {
    shape: number[];
    data: string;
}

interface RawG2PModel {
    enc_emb: EncodedTensor;
    enc_w_ih: EncodedTensor;
    enc_w_hh: EncodedTensor;
    enc_b_ih: EncodedTensor;
    enc_b_hh: EncodedTensor;
    dec_emb: EncodedTensor;
    dec_w_ih: EncodedTensor;
    dec_w_hh: EncodedTensor;
    dec_b_ih: EncodedTensor;
    dec_b_hh: EncodedTensor;
    fc_w: EncodedTensor;
    fc_b: EncodedTensor;
    graphemes: string[];
    phonemes: string[];
}

interface G2PModel {
    enc_emb: Float32Array[];
    enc_w_ih: Float32Array[];
    enc_w_hh: Float32Array[];
    enc_b_ih: Float32Array;
    enc_b_hh: Float32Array;
    enc_w_hh_shape: number[];
    dec_emb: Float32Array[];
    dec_w_ih: Float32Array[];
    dec_w_hh: Float32Array[];
    dec_b_ih: Float32Array;
    dec_b_hh: Float32Array;
    fc_w: Float32Array[];
    fc_b: Float32Array;
    g2idx: Record<string, number>;
    idx2p: Record<number, string>;
}

let modelPromise: Promise<G2PModel | null> | null = null;

const base64ToFloat32 = (value: string): Float32Array => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Float32Array(bytes.buffer);
};

const reshape2D = (flat: Float32Array, rows: number, cols: number): Float32Array[] => {
    const result: Float32Array[] = [];
    for (let row = 0; row < rows; row += 1) {
        result.push(flat.subarray(row * cols, (row + 1) * cols));
    }
    return result;
};

const decodeTensor = (tensor: EncodedTensor): Float32Array | Float32Array[] => {
    const flat = base64ToFloat32(tensor.data);
    if (tensor.shape.length === 2) {
        return reshape2D(flat, tensor.shape[0], tensor.shape[1]);
    }
    return flat;
};

const loadModel = async (): Promise<G2PModel | null> => {
    if (!modelPromise) {
        modelPromise = (async () => {
            const response = await fetch(TINY_TTS_ASSETS.g2pModel);
            if (!response.ok) {
                console.warn(`[TinyTTS] g2p_model.json unavailable: HTTP ${response.status}`);
                return null;
            }

            const raw = await response.json() as RawG2PModel;
            const model = {
                enc_emb: decodeTensor(raw.enc_emb) as Float32Array[],
                enc_w_ih: decodeTensor(raw.enc_w_ih) as Float32Array[],
                enc_w_hh: decodeTensor(raw.enc_w_hh) as Float32Array[],
                enc_b_ih: decodeTensor(raw.enc_b_ih) as Float32Array,
                enc_b_hh: decodeTensor(raw.enc_b_hh) as Float32Array,
                enc_w_hh_shape: raw.enc_w_hh.shape,
                dec_emb: decodeTensor(raw.dec_emb) as Float32Array[],
                dec_w_ih: decodeTensor(raw.dec_w_ih) as Float32Array[],
                dec_w_hh: decodeTensor(raw.dec_w_hh) as Float32Array[],
                dec_b_ih: decodeTensor(raw.dec_b_ih) as Float32Array,
                dec_b_hh: decodeTensor(raw.dec_b_hh) as Float32Array,
                fc_w: decodeTensor(raw.fc_w) as Float32Array[],
                fc_b: decodeTensor(raw.fc_b) as Float32Array,
                g2idx: Object.fromEntries(raw.graphemes.map((token, index) => [token, index])),
                idx2p: Object.fromEntries(raw.phonemes.map((token, index) => [index, token])),
            };

            return model;
        })();
    }

    return modelPromise;
};

const gruCell = (
    x: Float32Array,
    h: Float32Array,
    wIh: Float32Array[],
    wHh: Float32Array[],
    bIh: Float32Array,
    bHh: Float32Array,
    hiddenDim: number,
): Float32Array => {
    const dim3 = hiddenDim * 3;
    const rznIh = new Float32Array(dim3);
    const rznHh = new Float32Array(dim3);

    for (let index = 0; index < dim3; index += 1) {
        let inputSum = bIh[index];
        const inputRow = wIh[index];
        for (let col = 0; col < x.length; col += 1) inputSum += x[col] * inputRow[col];
        rznIh[index] = inputSum;

        let hiddenSum = bHh[index];
        const hiddenRow = wHh[index];
        for (let col = 0; col < h.length; col += 1) hiddenSum += h[col] * hiddenRow[col];
        rznHh[index] = hiddenSum;
    }

    const dim2 = hiddenDim * 2;
    const next = new Float32Array(hiddenDim);
    for (let index = 0; index < hiddenDim; index += 1) {
        const r = 1 / (1 + Math.exp(-(rznIh[index] + rznHh[index])));
        const z = 1 / (1 + Math.exp(-(rznIh[hiddenDim + index] + rznHh[hiddenDim + index])));
        const n = Math.tanh(rznIh[dim2 + index] + r * rznHh[dim2 + index]);
        next[index] = (1 - z) * n + z * h[index];
    }

    return next;
};

const gruEncode = (
    embeds: Float32Array[],
    wIh: Float32Array[],
    wHh: Float32Array[],
    bIh: Float32Array,
    bHh: Float32Array,
    hiddenDim: number,
): Float32Array => {
    let h = new Float32Array(hiddenDim);
    for (const embed of embeds) {
        h = gruCell(embed, h, wIh, wHh, bIh, bHh, hiddenDim);
    }
    return h;
};

export const predictG2P = async (word: string): Promise<string[] | null> => {
    const model = await loadModel();
    if (!model) return null;

    const hiddenDim = model.enc_w_hh_shape[1];
    const chars = [...word, '</s>'];
    const encInput = chars.map((char) => {
        const index = model.g2idx[char] ?? model.g2idx['<unk>'];
        return model.enc_emb[index];
    });

    const lastHidden = gruEncode(
        encInput,
        model.enc_w_ih,
        model.enc_w_hh,
        model.enc_b_ih,
        model.enc_b_hh,
        hiddenDim,
    );

    let dec = model.dec_emb[2];
    let h = lastHidden;
    const predictions: string[] = [];

    for (let step = 0; step < 20; step += 1) {
        h = gruCell(dec, h, model.dec_w_ih, model.dec_w_hh, model.dec_b_ih, model.dec_b_hh, hiddenDim);

        let maxValue = -Infinity;
        let maxIndex = 0;
        for (let rowIndex = 0; rowIndex < model.fc_w.length; rowIndex += 1) {
            let logit = model.fc_b[rowIndex];
            const row = model.fc_w[rowIndex];
            for (let col = 0; col < hiddenDim; col += 1) logit += h[col] * row[col];
            if (logit > maxValue) {
                maxValue = logit;
                maxIndex = rowIndex;
            }
        }

        if (maxIndex === 3) break;
        predictions.push(model.idx2p[maxIndex] || '<unk>');
        dec = model.dec_emb[maxIndex];
    }

    return predictions;
};

export const releaseG2PModel = (): void => {
    modelPromise = null;
};

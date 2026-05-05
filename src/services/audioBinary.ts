const BASE64_CHUNK_SIZE = 0x2000;

export const decodeBase64ToBytes = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    return Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
};

export const encodeBytesToBase64 = (bytes: Uint8Array): string => {
    const partCount = Math.ceil(bytes.length / BASE64_CHUNK_SIZE);
    const binaryParts = new Array<string>(partCount);

    for (let offset = 0, partIndex = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE, partIndex++) {
        const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
        binaryParts[partIndex] = String.fromCharCode(...chunk);
    }

    return btoa(binaryParts.join(''));
};

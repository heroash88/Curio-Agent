const readBlobAsDataUrl = async (blob: Blob): Promise<string | null> =>
    await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(typeof reader.result === 'string' ? reader.result : null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
    });

export const blobToBase64Data = async (blob: Blob): Promise<string | null> => {
    const dataUrl = await readBlobAsDataUrl(blob);
    if (!dataUrl) {
        return null;
    }
    const commaIndex = dataUrl.indexOf(',');
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : null;
};

export const canvasToJpegBase64Data = async (
    canvas: HTMLCanvasElement,
    quality = 0.7,
): Promise<string | null> => {
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) {
        return null;
    }
    return await blobToBase64Data(blob);
};

import { describe, expect, it, vi } from 'vitest';

import { describeCameraSnapshot } from './cameraVision';

describe('describeCameraSnapshot', () => {
  it('captures one image, sends it to the provider, and always stops the camera tracks', async () => {
    const stop = vi.fn();
    const provider = {
      generateVisionText: vi.fn().mockResolvedValue('That is a red coffee mug.'),
    };

    const text = await describeCameraSnapshot(
      provider,
      {
        prompt: 'What am I holding?',
      },
      {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        }) as unknown as MediaStream),
        captureFrameFromStream: vi.fn(async () => ({
          mimeType: 'image/jpeg',
          base64Data: 'base64-jpeg',
          width: 640,
          height: 480,
        })),
      },
    );

    expect(text).toBe('That is a red coffee mug.');
    expect(provider.generateVisionText).toHaveBeenCalledWith({
      prompt: 'What am I holding?',
      systemPrompt: undefined,
      temperature: undefined,
      image: {
        mimeType: 'image/jpeg',
        base64Data: 'base64-jpeg',
        width: 640,
        height: 480,
      },
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the provider does not support image input', async () => {
    await expect(
      describeCameraSnapshot(
        { generateText: vi.fn() },
        { prompt: 'What is this?' },
      ),
    ).rejects.toThrow(/does not support image input/i);
  });
});

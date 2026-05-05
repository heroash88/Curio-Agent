import { sanitizeLLMVisibleText } from './ai/llmProvider';

type GeminiModelPartLike = {
    text?: unknown;
    thought?: unknown;
};

export const getVisibleGeminiModelPartText = (part: GeminiModelPartLike | null | undefined): string => {
    if (!part || part.thought === true) {
        return '';
    }

    return typeof part.text === 'string'
        ? sanitizeLLMVisibleText(part.text)
        : '';
};

export const shouldDisableGeminiLiveThoughts = (modelName: string): boolean =>
    modelName.toLowerCase().includes('gemini-2.5');

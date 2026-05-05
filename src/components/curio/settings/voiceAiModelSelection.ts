import type { CustomLLMProviderType } from '../../../utils/settingsStorage';

export const CUSTOM_LLM_MODEL_SELECT_VALUE = '__custom';

export const getLlmModelSelectValue = (
    modelOptions: string[],
    model: string,
    customInputActive: boolean,
): string => {
    if (customInputActive) {
        return CUSTOM_LLM_MODEL_SELECT_VALUE;
    }

    return modelOptions.includes(model) ? model : CUSTOM_LLM_MODEL_SELECT_VALUE;
};

export const shouldApplyOpenAIModelDefault = (
    providerType: CustomLLMProviderType,
    model: string,
    defaultModel: string | undefined,
    customInputActive: boolean,
): boolean => providerType === 'openai' && !customInputActive && !model && Boolean(defaultModel);

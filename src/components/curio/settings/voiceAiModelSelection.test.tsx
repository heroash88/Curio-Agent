import { describe, expect, it } from 'vitest';

import { OPENAI_COMPATIBLE_PROVIDER_PRESETS } from '../../../services/ai/openAICompatiblePresets';
import {
    CUSTOM_LLM_MODEL_SELECT_VALUE,
    getLlmModelSelectValue,
    shouldApplyOpenAIModelDefault,
} from './voiceAiModelSelection';

describe('voice AI model selection', () => {
    it('keeps the dropdown in custom mode while the custom input is active', () => {
        expect(getLlmModelSelectValue(['gpt-4o-mini', 'gpt-4o'], 'gpt-4o-mini', true))
            .toBe(CUSTOM_LLM_MODEL_SELECT_VALUE);
    });

    it('shows custom mode for a saved model that is not in the provider options', () => {
        expect(getLlmModelSelectValue(['gpt-4o-mini', 'gpt-4o'], 'gpt-4.1-nano', false))
            .toBe(CUSTOM_LLM_MODEL_SELECT_VALUE);
    });

    it('does not restore the OpenAI preset default while custom input is active', () => {
        expect(shouldApplyOpenAIModelDefault('openai', '', 'gpt-4o-mini', true)).toBe(false);
        expect(shouldApplyOpenAIModelDefault('openai', '', 'gpt-4o-mini', false)).toBe(true);
    });

    it('keeps custom model input available for every hosted OpenAI-compatible preset', () => {
        for (const preset of OPENAI_COMPATIBLE_PROVIDER_PRESETS.filter((option) => option.modelOptions.length > 0)) {
            expect(getLlmModelSelectValue(preset.modelOptions, preset.defaultModel, true))
                .toBe(CUSTOM_LLM_MODEL_SELECT_VALUE);
            expect(shouldApplyOpenAIModelDefault('openai', '', preset.defaultModel, true)).toBe(false);
        }
    });

    it('does not apply OpenAI model defaults to Gemini or Ollama settings', () => {
        expect(shouldApplyOpenAIModelDefault('gemini', '', 'gpt-4o-mini', false)).toBe(false);
        expect(shouldApplyOpenAIModelDefault('ollama', '', 'gpt-4o-mini', false)).toBe(false);
    });
});

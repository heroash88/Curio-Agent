/**
 * ToolCallRouter: registry and dispatcher for Gemini Live, Nova Sonic, and
 * text LLM tool calls.
 *
 * Implementation lives in ./toolRouter/. This file is the stable public
 * surface; importing it registers every built-in handler as a side effect
 * so callers can use getToolHandler/routeToolCall immediately.
 */

import './toolRouter/handlers';

export {
    type ToolCallContext,
    type ToolCallResult,
    type ToolHandler,
    getToolHandler,
    routeToolCall,
} from './toolRouter/router';

export {
    isExplicitVideoIntent,
    normalizeVideoSearchQuery,
    sanitizeToolResultForModel,
} from './toolRouter/utils';

export { interceptForDeviceCard } from './toolRouter/deviceCardInterceptor';

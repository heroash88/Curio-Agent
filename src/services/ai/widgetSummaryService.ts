import { createConfiguredCustomLLMProvider } from "./customLlmRuntime";
import type { LLMChatMessage } from "./llmProvider";
import { getDashboardLayout } from "../../utils/settingsStorage";

export interface WidgetSummaryContext {
  widgetId: string;
  widgetType: string;
  textContent: string;
}

/**
 * Strip citation links, bare URLs, and markdown link syntax that LLM grounding
 * features (Nova, Gemini) inject into responses regardless of prompt instructions.
 */
const stripCitations = (text: string): string =>
  text
    // Remove markdown links: [text](url) -> text
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    // Remove bare parenthesized URLs: (https://...) or (domain.com)
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    .replace(/\([a-z0-9-]+\.[a-z]{2,}[^)]*\)/g, '')
    // Remove bare URLs
    .replace(/https?:\/\/[^\s),]+/g, '')
    // Clean up leftover double spaces and trailing punctuation artifacts
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim();

/**
 * Build supplemental structured context from widget config data.
 * This provides the LLM with underlying data that may not be visible
 * in the DOM (e.g. when a portfolio widget is in compact mode).
 */
const getWidgetConfigContext = (widgetId: string, widgetType: string): string => {
  try {
    const layout = getDashboardLayout();
    const widget = layout.find((w) => w.id === widgetId);
    if (!widget?.config) return '';

    if (widgetType === 'portfolio' && widget.config.portfolioHoldings?.length) {
      const holdings = widget.config.portfolioHoldings;
      const lines = holdings.map(
        (h) => `${h.symbol}${h.name ? ` (${h.name})` : ''}: ${h.shares} shares`
      );
      return `\nPortfolio holdings:\n${lines.join('\n')}`;
    }

    if (widgetType === 'stock' && widget.config.symbols) {
      return `\nTracked stock symbols: ${widget.config.symbols}`;
    }
  } catch {
    // Settings unavailable — fall through to DOM-only text
  }
  return '';
};

export const extractWidgetTextContent = (widgetId: string, widgetType?: string): string | null => {
  if (typeof document === "undefined") return null;
  const widgetNode = document.querySelector(`[data-dashboard-widget-id="${widgetId}"]`);
  if (!widgetNode) return null;

  // We look specifically for the body to avoid reading action menu buttons or resize handles
  const bodyNode = widgetNode.querySelector(".dashboard-widget-touch-scroll, .dashboard-widget-scroll")
    || widgetNode.querySelector("[data-dashboard-moving-widget]")?.lastElementChild
    || widgetNode;

  let text = (bodyNode as HTMLElement).innerText || "";
  text = text.trim();

  // Append structured config data for widgets whose DOM text is incomplete
  if (widgetType) {
    text += getWidgetConfigContext(
      widgetNode.getAttribute('data-dashboard-widget-id') || widgetId,
      widgetType,
    );
  }

  // Truncate to reasonable context window to avoid blowing up small models
  // ~3000 chars is roughly 600-800 tokens, plenty for a widget summary
  return text.substring(0, 3000);
};

export const generateWidgetSummary = async (context: WidgetSummaryContext): Promise<string> => {
  const provider = await createConfiguredCustomLLMProvider();

  const systemPrompt = `You are a concise AI summarizer for a personal dashboard.
The user has asked for a summary of a dashboard widget (Type: ${context.widgetType}).
Here is the visible text content of the widget:
"""
${context.textContent}
"""

Rules:
- Summarize the actual data in 1-2 brief sentences. Describe what the data shows (values, trends, status).
- Use **bold** for key numbers or names.
- Do NOT include any URLs, links, citations, or references.
- Do NOT describe the widget itself, its size, or its layout.
- Do NOT add pleasantries or filler. Return only the summary.`;

  const result = await provider.generateText({
    prompt: "Please summarize the widget content.",
    systemPrompt,
    temperature: 0.3,
  });

  return stripCitations(result);
};

export const generateWidgetFollowUp = async (
  context: WidgetSummaryContext,
  chatHistory: LLMChatMessage[],
  newMessage: string
): Promise<string> => {
  const provider = await createConfiguredCustomLLMProvider();

  const systemPrompt = `You are a helpful AI assistant answering follow-up questions about a dashboard widget (Type: ${context.widgetType}).
Here is the visible text content of the widget you are discussing:
"""
${context.textContent}
"""
Keep your answers brief, helpful, and directly related to the widget content or the user's question. Do NOT include URLs, links, or citations in your responses.`;

  // Ensure the first non-system message is always a user message.
  // The chat history may start with an assistant message (the initial summary),
  // which violates OpenAI API requirements. Prepend a synthetic user turn.
  const normalizedHistory: LLMChatMessage[] = [];
  let needsUserPrefix = true;
  for (const msg of chatHistory) {
    if (needsUserPrefix && msg.role === 'assistant') {
      normalizedHistory.push({ role: 'user', content: 'Summarize this widget for me.' });
    }
    if (msg.role === 'user') needsUserPrefix = false;
    normalizedHistory.push(msg);
  }

  const messages: LLMChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...normalizedHistory,
    { role: "user", content: newMessage }
  ];

  if (provider.generateToolResponse) {
    const response = await provider.generateToolResponse({
      messages,
      tools: [],
      temperature: 0.7,
    });
    return stripCitations(response.text);
  }

  // Fallback to generateText if generateToolResponse isn't supported by the provider interface
  const fullPrompt = messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n") + "\n\nASSISTANT:\n";
  const result = await provider.generateText({
    prompt: fullPrompt,
    temperature: 0.7,
  });
  return stripCitations(result);
};

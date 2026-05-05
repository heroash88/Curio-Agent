import { stripFencedTranscriptBlocks } from './curioAgentModeUtils';

type CurioTranscriptOverlayProps = {
    showTranscript: boolean;
    showTextInput: boolean;
    effectiveUserTranscript: string | null | undefined;
    effectiveModelTranscript: string | null | undefined;
    latchedUserValue: string | null;
    latchedModelValue: string | null;
    effectiveIsSpeaking: boolean;
};

const INLINE_MARKDOWN_PATTERN = /(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
const MARKDOWN_LINK_PATTERN = /^\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)$/i;

function getMarkdownLinkLabel(label: string, url: string) {
    const trimmedLabel = label.trim();
    if (trimmedLabel && !/^https?:\/\//i.test(trimmedLabel)) {
        return trimmedLabel;
    }

    try {
        return new URL(url).hostname.replace(/^www\./i, '') || trimmedLabel || url;
    } catch {
        return trimmedLabel || url;
    }
}

function renderRichText(text: string) {
    return stripFencedTranscriptBlocks(text).split(INLINE_MARKDOWN_PATTERN).map((part, i) => {
        const linkMatch = part.match(MARKDOWN_LINK_PATTERN);
        if (linkMatch) {
            return (
                <span key={i} className="font-medium underline decoration-white/30 underline-offset-2">
                    {getMarkdownLinkLabel(linkMatch[1], linkMatch[2])}
                </span>
            );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
            return <em key={i} className="italic opacity-85">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="bg-white/[0.08] rounded px-1 py-0.5 text-[12px] font-mono">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

export function CurioTranscriptOverlay({
    showTranscript,
    showTextInput,
    effectiveUserTranscript,
    effectiveModelTranscript,
    latchedUserValue,
    latchedModelValue,
    effectiveIsSpeaking,
}: CurioTranscriptOverlayProps) {
    if (!showTranscript) {
        return null;
    }

    const userText = effectiveUserTranscript || latchedUserValue;
    const modelText = effectiveModelTranscript || latchedModelValue;
    const items: Array<{ speaker: string; text: string; isActive: boolean }> = [];

    if (userText && stripFencedTranscriptBlocks(userText)) {
        items.push({ speaker: 'user', text: userText, isActive: !!effectiveUserTranscript && !effectiveIsSpeaking });
    }
    if (modelText && stripFencedTranscriptBlocks(modelText)) {
        items.push({ speaker: 'model', text: modelText, isActive: !!effectiveModelTranscript && effectiveIsSpeaking });
    }

    return (
        <div
            className="absolute left-0 right-0 z-40 flex flex-col items-center pointer-events-none px-4 sm:px-6 curio-face-transcript-overlay"
            data-text-input-open={showTextInput ? 'true' : undefined}
        >
            <div className="flex w-full max-w-md sm:max-w-xl flex-col justify-end gap-2 sm:gap-3 max-h-[30vh] sm:max-h-[35vh] overflow-y-auto pb-2">
                {items.slice(-2).map((entry) => {
                    const isUser = entry.speaker === 'user';
                    return (
                        <div
                            key={`trans-${entry.speaker}`}
                            className="relative w-full rounded-2xl text-[12px] sm:text-[13.5px] leading-[1.6] sm:leading-[1.7] tracking-[0.01em] text-white"
                            style={{
                                animation: 'fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
                                background: isUser
                                    ? 'linear-gradient(135deg, rgba(0, 178, 255, 0.95), rgba(0, 140, 210, 0.95))'
                                    : 'linear-gradient(135deg, rgba(30, 32, 44, 0.97), rgba(24, 26, 36, 0.97))',
                                boxShadow: 'none',
                                border: isUser ? 'none' : '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="px-5 py-3">
                                <span className={entry.isActive ? 'flex items-start gap-2' : ''}>
                                    <span className="flex-1">{renderRichText(entry.text)}</span>
                                    {entry.isActive && (
                                        <span className="flex gap-1 ml-1 mt-[6px] shrink-0">
                                            <span className="block h-1 w-1 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.5s' }} />
                                            <span className="block h-1 w-1 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1.5s' }} />
                                            <span className="block h-1 w-1 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: '800ms', animationDuration: '1.5s' }} />
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

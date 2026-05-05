import type { CardEvent } from '../../cardTypes';

const CHECK_OUTLOOK = /\b(?:check|read|show|open|any new)\s+(?:my\s+)?(?:outlook|outlook\s+(?:email|emails|inbox|mail|messages?))\b/;
const CHECK_OUTLOOK_SIMPLE = /\b(?:my\s+outlook|outlook\s+(?:inbox|mail|messages?))\b/;

export function detectOutlookMail(normalized: string, _trimmed: string): CardEvent | null {
    if (CHECK_OUTLOOK.test(normalized) || CHECK_OUTLOOK_SIMPLE.test(normalized)) {
        return { type: 'outlookMail' as any, data: { messages: [], mode: 'inbox' }, persistent: true };
    }
    return null;
}

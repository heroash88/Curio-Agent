// Quick inline test of the findFirstItemIds traversal logic.
const raw = {
  content: [{
    type: 'text',
    text: '<untrusted_content_abc>\n' + JSON.stringify({
      success: true,
      content: {
        message: 'Found 1 email(s)',
        emails: [{
          itemId: 'AAkALgTest',
          itemChangeKey: 'CQAAABYTest',
          subject: 'Test',
        }]
      }
    }) + '\nIMPORTANT: untrusted'
  }]
};

function stripUntrustedWrapper(text) {
  if (!text) return text;
  let candidate = text;
  const leadTag = candidate.match(/^<([a-zA-Z_][\w-]*)(\b[^>]*)?>\s*/);
  if (leadTag) candidate = candidate.slice(leadTag[0].length);
  const trailTag = candidate.match(/<\/[a-zA-Z_][\w-]*>\s*$/);
  if (trailTag) candidate = candidate.slice(0, -trailTag[0].length);
  const firstBrace = candidate.search(/[{[]/);
  if (firstBrace > 0) candidate = candidate.slice(firstBrace);
  return candidate.trim();
}

function extractFirstJsonLiteral(text) {
  if (!text) return null;
  const first = text[0];
  if (first !== '{' && first !== '[') return null;
  const open = first;
  const close = first === '{' ? '}' : ']';
  let depth = 0, inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) { if (ch === '\\') escape = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return text.slice(0, i + 1); }
  }
  return null;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const unwrapped = stripUntrustedWrapper(value.trim());
  if (!unwrapped || !/^[{[]/.test(unwrapped)) return value;
  const sliced = extractFirstJsonLiteral(unwrapped);
  if (!sliced) return value;
  try { return JSON.parse(sliced); } catch { return value; }
}

function isRecord(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function firstString(...vals) { for (const v of vals) { if (typeof v === 'string' && v.trim()) return v.trim(); } return undefined; }

function collectEntries(value, depth = 0) {
  if (depth > 8 || value == null) return [];
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.flatMap(e => collectEntries(e, depth + 1));
  if (!isRecord(parsed)) return [];
  if (Object.prototype.hasOwnProperty.call(parsed, 'type') && typeof parsed.text === 'string' && Object.keys(parsed).length <= 4) return collectEntries(parsed.text, depth + 1);
  if (typeof parsed.text === 'string' && /^[{[]/.test(parsed.text.trim()) && Object.keys(parsed).length <= 4) return collectEntries(parsed.text, depth + 1);
  const arrayKeys = ['results','items','rows','records','data','emails','messages','events','tasks','todos','documents','docs','notes','pages','entries','value','lists','folders','checklistItems','channels'];
  for (const key of arrayKeys) { if (Array.isArray(parsed[key])) return collectEntries(parsed[key], depth + 1); }
  if (isRecord(parsed.content)) { const r = collectEntries(parsed.content, depth + 1); if (r.length > 0) return r; }
  if (isRecord(parsed.result)) { const r = collectEntries(parsed.result, depth + 1); if (r.length > 0) return r; }
  if (isRecord(parsed.data)) { const r = collectEntries(parsed.data, depth + 1); if (r.length > 0) return r; }
  if (Array.isArray(parsed.content)) { const r = parsed.content.flatMap(e => collectEntries(e, depth + 1)); if (r.length > 0) return r; }
  if (firstString(parsed.id, parsed.message_id, parsed.event_id, parsed.task_id, parsed.conversationId, parsed.conversation_id, parsed.url, parsed.title, parsed.name, parsed.subject, parsed.topic, parsed.summary)) return [parsed];
  return [];
}

const entries = collectEntries(raw);
console.log('entries found:', entries.length);
for (const e of entries) {
  console.log('  itemId:', e.itemId, '| itemChangeKey:', e.itemChangeKey);
}

// Now test findFirstItemIds
function findFirstItemIds(value) {
  const scan = (entry) => {
    const parsed = parseMaybeJson(entry);
    if (!isRecord(parsed)) return null;
    const itemId = firstString(parsed.itemId, parsed.ItemId, parsed.item_id, parsed.Id, parsed.id);
    const itemChangeKey = firstString(parsed.itemChangeKey, parsed.ItemChangeKey, parsed.item_change_key, parsed.ChangeKey, parsed.changeKey);
    if (itemId || itemChangeKey) return { itemId, itemChangeKey };
    return null;
  };
  const topLevel = scan(value);
  if (topLevel) return topLevel;
  for (const entry of collectEntries(value)) {
    const found = scan(entry);
    if (found) return found;
  }
  return {};
}

const result = findFirstItemIds(raw);
console.log('\nfindFirstItemIds result:', JSON.stringify(result));

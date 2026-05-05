import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BenderFace dashboard reuse', () => {
  it('does not carry dashboard-specific selectors that reshape the Bender artwork', () => {
    const benderSource = readFileSync(resolve(process.cwd(), 'src/components/curio/BenderFace.tsx'), 'utf8');
    const agentModeSource = readFileSync(resolve(process.cwd(), 'src/components/curio/CurioAgentMode.tsx'), 'utf8');

    expect(benderSource).not.toContain('curio-bender-widget-face');
    expect(agentModeSource).not.toContain('curio-bender-widget-face');
  });
});

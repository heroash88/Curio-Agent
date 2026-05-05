import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Returns the concatenation of `src/index.css` and every partial under
 * `src/styles/`, in the same order `src/index.tsx` imports them. Useful
 * for tests that want to assert on CSS rules without caring which
 * partial owns them.
 */
export function readAllAppCss(): string {
  const root = resolve(process.cwd());
  const entry = readFileSync(join(root, 'src/index.css'), 'utf8');
  const stylesDir = join(root, 'src/styles');
  const files = readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .sort();
  const partials = files.map((name) => readFileSync(join(stylesDir, name), 'utf8'));
  return [entry, ...partials].join('\n');
}

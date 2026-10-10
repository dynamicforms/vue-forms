import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Every non-spec TypeScript file of the library, relative to the repository root. */
const sources = (dir = 'src'): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });

/** The construction inside `errorFor`, which takes its code and detail from its arguments. */
const ERROR_FOR_BODY = 'new ValidationError(options?.code ?? code,';
const CALL = /this\.errorFor\(|new ValidationError\(/g;
const LITERAL = /^(?:this\.errorFor\(\s*\w+,|new ValidationError\()\s*'([a-z_]+)',\s*(?:\{\},\s*)?'((?:[^'\\]|\\.)*)'/;

/**
 * The code and English detail of every error the library constructs, read from its source: each `this.errorFor(…)`
 * call and each `new ValidationError(…)` outside `errorFor` names both as literals.
 */
const raised = () => {
  const found: Record<string, string> = {};
  const unreadable: string[] = [];
  sources().forEach((path) => {
    const text = read(path);
    for (const match of text.matchAll(CALL)) {
      const rest = text.slice(match.index);
      if (rest.startsWith(ERROR_FOR_BODY)) continue;
      const literal = rest.match(LITERAL);
      const line = text.slice(0, match.index).split('\n').length;
      if (literal) found[literal[1]] = literal[2];
      else unreadable.push(`${path}:${line}`);
    }
  });
  return { found, unreadable };
};

/** The messages docs/guide/getting-started.md lists for a locale to start from, by error code. */
const guideMessages = (): Record<string, string> => {
  const block = read('docs/guide/getting-started.md').match(/```json\n(\{\n {2}"errors": \{\n[\s\S]*?)\n```/);
  return JSON.parse(block![1]).errors;
};

/** The English detail column of the error code table in docs/api/validators.md, by error code. */
const tableDetails = (): Record<string, string> =>
  Object.fromEntries(
    [...read('docs/api/validators.md').matchAll(/^\| `([a-z_]+)` \|[^|\n]*\|[^|\n]*\| `([^`]*)` \|$/gm)].map(
      ([, code, detail]) => [code, detail],
    ),
  );

describe('the error codes the documentation lists', () => {
  it('are read from a source that states every code and detail as a literal', () => {
    const { found, unreadable } = raised();
    expect(unreadable).toEqual([]);
    expect(Object.keys(found).length).toBeGreaterThan(0);
  });

  it('are in the getting started guide, each with the English detail of the source', () => {
    expect(guideMessages()).toEqual(raised().found);
  });

  it('are in the error code table of the validators reference, each with the English detail of the source', () => {
    expect(tableDetails()).toEqual(raised().found);
  });
});

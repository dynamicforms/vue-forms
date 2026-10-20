import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ERROR_NAMESPACE } from '../index';

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
const LITERAL = new RegExp(
  String.raw`^(?:this\.errorFor\(\s*\w+,|new ValidationError\()\s*namespaced\('([a-z0-9_]+)'\),` +
    String.raw`\s*(?:\{\},\s*)?'((?:[^'\\]|\\.)*)'`,
);
/** The grammar of a full error code: namespace segments and the code, joined by `.`. */
const FULL_CODE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * The full code and English detail of every error the library constructs, read from its source: each
 * `this.errorFor(…)` call and each `new ValidationError(…)` outside `errorFor` builds its code with `namespaced()`
 * from a literal and states the detail as a literal.
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
      if (literal) found[`${ERROR_NAMESPACE}.${literal[1]}`] = literal[2];
      else unreadable.push(`${path}:${line}`);
    }
  });
  return { found, unreadable };
};

/** The messages docs/api/validators.md lists for a locale to start from, by full error code. */
const localeMessages = (): Record<string, string> => {
  const block = read('docs/api/validators.md').match(/```json\n(\{\n {2}"libs": \{\n[\s\S]*?)\n```/);
  const messages: Record<string, string> = JSON.parse(block![1]).libs[ERROR_NAMESPACE];
  return Object.fromEntries(Object.entries(messages).map(([code, text]) => [`${ERROR_NAMESPACE}.${code}`, text]));
};

/** The English detail column of the error code table in docs/api/validators.md, by error code. */
const tableDetails = (): Record<string, string> =>
  Object.fromEntries(
    [...read('docs/api/validators.md').matchAll(/^\| `([a-z0-9._-]+)` \|[^|\n]*\|[^|\n]*\| `([^`]*)` \|$/gm)].map(
      ([, code, detail]) => [code, detail],
    ),
  );

describe('the error codes the documentation lists', () => {
  it('are read from a source that states every code and detail as a literal', () => {
    const { found, unreadable } = raised();
    expect(unreadable).toEqual([]);
    expect(Object.keys(found).length).toBeGreaterThan(0);
  });

  it('are full codes in the library namespace', () => {
    expect(ERROR_NAMESPACE).toBe('vue-forms');
    Object.keys(raised().found).forEach((code) => {
      expect(code).toMatch(FULL_CODE);
      expect(code.slice(0, code.lastIndexOf('.'))).toBe(ERROR_NAMESPACE);
    });
  });

  it('are in the locale messages of the validators reference, each with the English detail of the source', () => {
    expect(localeMessages()).toEqual(raised().found);
  });

  it('are in the error code table of the validators reference, each with the English detail of the source', () => {
    expect(tableDetails()).toEqual(raised().found);
  });
});

/**
 * Guards the tab layout's element structure.
 *
 * Expo Router discovers screens by walking the authored JSX under `<Tabs>`, and
 * that walk descends only through fragments and `<TabList>`. A `<TabTrigger>`
 * nested inside any other wrapper - a positioning View, a styled panel - is
 * invisible to it, and the app dies at runtime with "Couldn't find any screens
 * for the navigator", pointing at `<Tabs>` rather than at the wrapper actually
 * responsible.
 *
 * TypeScript cannot see this: the tree is perfectly well-typed either way. So
 * the invariant is checked here instead, on the source text:
 *
 *   - every <TabTrigger> is a direct child of <TabList>
 *   - <TabList> is a direct child of <Tabs>
 *
 * The check is deliberately structural rather than semantic. It parses JSX tag
 * nesting only, which is enough to catch the regression and cheap enough to run
 * on every `npm run check`.
 */

import { readFileSync } from 'node:fs';

const FILE = 'app/(tabs)/_layout.tsx';
const source = readFileSync(FILE, 'utf8');

/** Tags whose nesting we care about. Everything else is an opaque wrapper. */
const TRACKED = new Set(['Tabs', 'TabList', 'TabTrigger', 'TabSlot']);

/**
 * Walks JSX tags, maintaining a stack of open elements. Self-closing tags never
 * push. Comments and strings are stripped first so a tag inside a doc comment
 * cannot skew the stack.
 */
function walk(text) {
  const cleaned = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  const tag = /<(\/?)([A-Z][A-Za-z0-9_.]*)((?:[^<>]|\{[^{}]*\})*?)(\/?)>/g;
  const stack = [];
  const found = [];

  let match;
  while ((match = tag.exec(cleaned)) !== null) {
    const [, closing, name, , selfClosing] = match;

    if (closing) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }

    if (TRACKED.has(name)) {
      // The FULL stack, deliberately. Filtering it down to tracked tags would
      // hide exactly the wrappers this check exists to catch - a TabList buried
      // under a View would look like a direct child of Tabs.
      found.push({ name, parents: [...stack] });
    }
    if (!selfClosing) stack.push(name);
  }

  return found;
}

const elements = walk(source);
const problems = [];

const triggers = elements.filter((e) => e.name === 'TabTrigger');
if (triggers.length === 0) {
  problems.push('no <TabTrigger> found at all - the navigator will have no screens');
}

/** Fragments are transparent to the walk, so skip past them. */
const immediateParent = (parents) => {
  for (let i = parents.length - 1; i >= 0; i -= 1) {
    if (parents[i] !== 'Fragment' && parents[i] !== 'React.Fragment') return parents[i];
  }
  return undefined;
};

for (const trigger of triggers) {
  const parent = immediateParent(trigger.parents);
  if (parent !== 'TabList') {
    problems.push(
      `<TabTrigger> is nested under <${parent ?? 'nothing'}> rather than directly in <TabList>. ` +
        "Expo Router's screen walk will not find it.",
    );
  }
}

const lists = elements.filter((e) => e.name === 'TabList');
if (lists.length === 0) {
  problems.push('no <TabList> found — triggers are only discovered inside one');
}
for (const list of lists) {
  const parent = immediateParent(list.parents);
  if (parent !== 'Tabs') {
    problems.push(
      `<TabList> is nested under <${parent ?? 'nothing'}> rather than directly in <Tabs>. ` +
        'Wrap the bar with styling on <TabList> itself instead.',
    );
  }
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${FILE}\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `OK: ${FILE} - ${triggers.length} <TabTrigger> site(s), each directly inside ` +
    '<TabList>, which is directly inside <Tabs>.',
);

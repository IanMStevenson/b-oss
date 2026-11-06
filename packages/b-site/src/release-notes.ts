// The site's "What's new" pages read packages/b-site/release-notes/<product>.md at build time. Each file is,
// newest first, a heading "## <version> - <YYYY-MM-DD>" then one plain-words note of 500 characters or fewer.
// A malformed file fails the build. A product with no file or no notes has no page and no link.
export const PRODUCTS = ['b-ark', 'b-ark-chrome', 'b-mobile', 'b-mobile-pc'] as const;
export type Product = (typeof PRODUCTS)[number];

export const MAX_NOTE_LENGTH = 500;

export interface ReleaseNote {
  version: string;
  date: string;
  /** Paragraphs of plain text: blank lines separate them, single line breaks are spaces. */
  paragraphs: string[];
}

const HEADING = /^## (\d+(?:\.\d+)+) - (\d{4}-\d{2}-\d{2})$/;

function isRealDate(iso: string): boolean {
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

export function parseReleaseNotes(text: string, source: string): ReleaseNote[] {
  const fail = (problem: string): never => {
    throw new Error(`${source}: ${problem}`);
  };
  const sections: { version: string; date: string; lines: string[] }[] = [];

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('#')) {
      const heading = HEADING.exec(line);
      if (!heading) fail(`malformed heading "${line}": expected "## <version> - <YYYY-MM-DD>"`);
      const [, version, date] = heading as RegExpExecArray;
      if (!isRealDate(date)) fail(`"${line}" is not a real date`);
      sections.push({ version, date, lines: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    } else if (line.trim()) {
      fail(`text before the first heading: "${line}"`);
    }
  }

  return sections.map(({ version, date, lines }, i) => {
    const note = lines.join('\n').trim();
    if (!note) fail(`${version} has no note`);
    const length = [...note].length;
    if (length > MAX_NOTE_LENGTH) fail(`${version} is ${length} characters; the limit is ${MAX_NOTE_LENGTH}`);
    if (i > 0 && date > sections[i - 1].date) fail(`${version} is out of order: newest comes first`);
    return { version, date, paragraphs: note.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ')) };
  });
}

const files = import.meta.glob<string>('../release-notes/*.md', { query: '?raw', import: 'default', eager: true });

const notes = new Map<string, ReleaseNote[]>();
for (const [path, text] of Object.entries(files)) {
  const name = path.split('/').pop() as string;
  const product = name.replace(/\.md$/, '');
  if (!(PRODUCTS as readonly string[]).includes(product)) {
    throw new Error(`release-notes/${name}: not a product (${PRODUCTS.join(', ')})`);
  }
  notes.set(product, parseReleaseNotes(text, `release-notes/${name}`));
}

export function notesFor(product: Product): ReleaseNote[] {
  return notes.get(product) ?? [];
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

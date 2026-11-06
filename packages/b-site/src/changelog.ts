// Reads the root CHANGELOG.md for the "What's new" pages. An entry appears only under the products it is
// tagged with ("b-ark:", "b-ark, b-ark-chrome:"); anything else (internal:, other packages, untagged, and
// Unreleased) stays off the site. A product with no tagged entries has no page.
export const PRODUCTS = ['b-ark', 'b-ark-chrome', 'b-mobile', 'b-mobile-pc'] as const;
export type Product = (typeof PRODUCTS)[number];

export interface Release {
  version: string;
  date: string;
  entries: string[];
}

const NAME = '(?:b-mobile-pc|b-mobile|b-ark-chrome|b-ark)';
const TAG = new RegExp(`^(${NAME}(?:(?:, | and )${NAME})*):\\s*`);
const HEADING = /^## \[(?:b-mobile(?:-pc)? )?(\d[^\]]*)\] - (\d{4}-\d{2}-\d{2})/;

export function releasesFor(changelog: string, product: Product): Release[] {
  const releases: Release[] = [];
  let bullet: string | null = null;

  const endBullet = () => {
    const current = releases[releases.length - 1];
    const tag = bullet === null ? null : TAG.exec(bullet);
    if (bullet !== null && tag && current?.version && tag[1].split(/, | and /).includes(product)) {
      const text = bullet.slice(tag[0].length);
      current.entries.push(text.charAt(0).toUpperCase() + text.slice(1));
    }
    bullet = null;
  };

  for (const line of changelog.split('\n')) {
    if (line.startsWith('## ')) {
      endBullet();
      const heading = HEADING.exec(line);
      releases.push({ version: heading?.[1] ?? '', date: heading?.[2] ?? '', entries: [] });
    } else if (line.startsWith('- ')) {
      endBullet();
      bullet = line.slice(2);
    } else if (bullet !== null && line.startsWith('  ')) {
      bullet += ` ${line.trim()}`;
    } else {
      endBullet();
    }
  }
  endBullet();
  return releases.filter((r) => r.version && r.entries.length > 0);
}

/** Entries use only **bold** and `code`; everything else is plain text. */
export function entryHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

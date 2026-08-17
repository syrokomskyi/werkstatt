/*
<MODULE_CONTRACT>
<purpose>RFC-0165/RFC-0317: pure RSS 2.0 + JSON Feed v1.1 formatters. Framework-agnostic —
the site-OS feed.generate command supplies the channel + dated items and writes the result.</purpose>
<non-goals>
  <item>Do not read files or fetch content — the caller supplies resolved items.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0165: initial implementation.</item>
  <item>RFC-0317: add JSON Feed v1.1 output from the same item set.</item>
</CHANGE_SUMMARY>
*/

export interface FeedItem {
  title: string;
  /** Absolute URL. */
  url: string;
  summary: string;
  /** ISO date. */
  publishedAt: string;
  /** ISO date; defaults to publishedAt. */
  updatedAt?: string;
}

export interface FeedChannel {
  title: string;
  /** Absolute site URL. */
  url: string;
  description: string;
  language: string;
  /** Absolute URL of the feed itself (Atom self-link). */
  selfUrl: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toUTCString();
}

export function buildRssFeed(channel: FeedChannel, items: FeedItem[]): string {
  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  // Deterministic: derive lastBuildDate from item dates (never `now`), and omit it for an
  // empty feed so a no-article app produces a stable, churn-free file.
  const lastBuild = sorted[0]?.updatedAt ?? sorted[0]?.publishedAt;

  const itemXml = sorted
    .map((item) =>
      [
        "    <item>",
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
        `      <description>${escapeXml(item.summary)}</description>`,
        `      <pubDate>${escapeXml(toRfc822(item.publishedAt))}</pubDate>`,
        "    </item>",
      ].join("\n"),
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.url)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${escapeXml(channel.language)}</language>`,
    ...(lastBuild ? [`    <lastBuildDate>${escapeXml(toRfc822(lastBuild))}</lastBuildDate>`] : []),
    `    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...(itemXml ? [itemXml] : []),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export interface JsonFeedInput {
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  language: string;
  items: FeedItem[];
}

/** RFC-0317: JSON Feed v1.1 from the same item set as the RSS feed. */
export function buildJsonFeed(input: JsonFeedInput): string {
  const sorted = [...input.items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  const feed: Record<string, unknown> = {
    version: "https://jsonfeed.org/version/1.1",
    title: input.title,
    description: input.description || undefined,
    home_page_url: input.home_page_url,
    feed_url: input.feed_url,
    language: input.language,
  };
  if (sorted.length > 0) {
    feed.items = sorted.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      content_text: item.summary || undefined,
      date_published: item.publishedAt,
      ...(item.updatedAt ? { date_modified: item.updatedAt } : {}),
    }));
  }

  return `${JSON.stringify(feed, null, 2)}\n`;
}

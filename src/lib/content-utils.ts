export function tagSlug(tag: string): string {
  const value = tag.normalize('NFKC').trim().toLowerCase();
  // Encode punctuation explicitly so C++, C# and C cannot collide.
  return Array.from(value).map((char) => /[\p{L}\p{N}-]/u.test(char) ? char : /\s/u.test(char) ? '-' : `-${char.codePointAt(0)!.toString(16)}-`).join('');
}

export const postUrl = (id: string) => `/posts/${id.split('/').map(encodeURIComponent).join('/')}/`;
export const tagUrl = (tag: string) => `/tags/${encodeURIComponent(tagSlug(tag))}/`;
export const formatDate = (date: Date) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(date);
export function readingMinutes(body = ''): number {
  const chinese = body.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length || 0;
  const words = body.match(/[A-Za-z0-9]+/g)?.length || 0;
  return Math.max(1, Math.ceil(chinese / 350 + words / 220));
}
export function visiblePosts<T extends { id: string; data: { draft: boolean; pubDate: Date } }>(posts: T[], includeDrafts = false): T[] {
  return posts.filter((post) => includeDrafts || !post.data.draft).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || a.id.localeCompare(b.id));
}

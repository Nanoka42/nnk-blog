import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagSlug, tagUrl, postUrl, visiblePosts, readingMinutes, formatDate } from '../src/lib/content-utils.ts';

test('drafts are excluded and dates sort newest first without mutating input', () => {
  const posts = [
    { id: 'old', data: { draft: false, pubDate: new Date('2026-09-08') } },
    { id: 'draft', data: { draft: true, pubDate: new Date('2026-09-10') } },
    { id: 'new', data: { draft: false, pubDate: new Date('2026-09-09') } },
  ];
  assert.deepEqual(visiblePosts(posts).map((post) => post.id), ['new', 'old']);
  assert.deepEqual(visiblePosts(posts, true).map((post) => post.id), ['draft', 'new', 'old']);
  assert.equal(posts[0].id, 'old');
});

test('tag and post URLs handle Chinese, whitespace, punctuation and nested IDs', () => {
  assert.equal(tagSlug('Music AI'), 'music-ai');
  assert.equal(tagSlug('数学'), '数学');
  assert.notEqual(tagSlug('C++'), tagSlug('C#'));
  assert.equal(tagUrl('数学'), '/tags/%E6%95%B0%E5%AD%A6/');
  assert.equal(postUrl('学习/note'), '/posts/%E5%AD%A6%E4%B9%A0/note/');
});

test('reading estimates count mixed languages and dates do not drift with timezone', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('中'.repeat(350) + ' word'.repeat(220)), 2);
  assert.match(formatDate(new Date('2026-09-09T00:00:00Z')), /2026.*09.*09/);
});

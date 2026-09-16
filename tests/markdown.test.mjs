import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { markdown } from '../astro.config.mjs';

const renderer = await markdown.processor.createRenderer(markdown);
const fixture = await readFile(new URL('../src/content/posts/markdown-regression.md', import.meta.url), 'utf8');
const body = fixture.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const result = await renderer.render(body, { fileURL: new URL('../src/content/posts/markdown-regression.md', import.meta.url) });
const $ = load(result.code);

test('GFM fixture renders headings, tables, tasks, footnotes, images and inline formatting', () => {
  for (const selector of ['h1', 'h2', 'h3', 'h4', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'img', 'hr', 'input[type=checkbox]', '[data-footnotes]']) assert.ok($(selector).length, selector);
  assert.equal($('.table-scroll table').length, 2);
  assert.equal($('.table-scroll[tabindex="0"]').length, 2);
  assert.ok($('th[align="right"]').length);
  assert.ok($('.heading-anchor').length >= 7);
  assert.ok(result.metadata.headings.every((heading) => !heading.text.endsWith('#')));
});

test('every inline and display math node preserves exact original TeX before rendering', () => {
  assert.equal($('.math-copy').length, 6);
  assert.equal($('.math-copy .katex').length, 6);
  assert.equal($('.math-inline').first().attr('data-math-source'), 'E = mc^2');
  assert.equal($('.math-block').first().attr('data-math-source'), String.raw`\mathbf{y} = \mathbf{W}\mathbf{x} + \mathbf{b}`);
  $('.math-copy').each((_, element) => {
    assert.equal($(element).find('button').attr('data-copy-source'), $(element).attr('data-math-source'));
    assert.ok($(element).find('button[aria-label]').length);
  });
  assert.equal($('.math-inline').eq(1).attr('data-math-source'), String.raw`x < y \quad \text{a\&b}`);
});

test('all fenced languages and one-line blocks retain exact raw source and Shiki tokens', () => {
  const original = [...body.matchAll(/```([^\n]*)\n([\s\S]*?)\n```/g)];
  assert.equal($('.code-block').length, original.length);
  original.forEach((match, i) => {
    const block = $('.code-block').eq(i);
    assert.equal(block.find('button').attr('data-copy-source'), match[2]);
    assert.ok(block.find('pre.astro-code span[style]').length, match[1]);
  });
  assert.equal($('.code-block').eq(1).find('button').attr('data-copy-source'), 'print("a single fenced line still has a copy button")');
});

test('TeX and code containing HTML metacharacters remain data; invalid TeX fails compilation', async (t) => {
  assert.equal($('button[data-value]').length, 0);
  assert.ok($('.code-block').eq(2).find('button').attr('data-copy-source').includes('<button data-value="a&b">'));
  const mockedError = t.mock.method(console, 'error', () => {});
  await assert.rejects(renderer.render('$\\unknowncommand{a}$'));
  mockedError.mock.restore();
});

test('math headings get meaningful anchors and non-highlighted fences still copy', async () => {
  const rendered = await renderer.render('## $E=mc^2$\n\n```math\nx < y\n```');
  const document = load(rendered.code);
  assert.ok(rendered.metadata.headings[0].slug);
  assert.equal(rendered.metadata.headings[0].text, 'E=mc^2');
  assert.equal(document('.code-block button').attr('data-copy-source'), 'x < y');
});

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { profile } from '../config';
import { visiblePosts, postUrl } from '../lib/content-utils';

export async function GET(context: APIContext) {
  const posts = visiblePosts(await getCollection('posts'));
  return rss({ title: profile.title, description: profile.description, site: context.site!, items: posts.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.pubDate, categories: post.data.tags, link: postUrl(post.id) })), customData: '<language>zh-CN</language>' });
}

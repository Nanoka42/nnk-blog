import { getCollection } from 'astro:content';
import { visiblePosts } from './content-utils';

export async function getPosts() {
  return visiblePosts(await getCollection('posts'), import.meta.env.DEV);
}

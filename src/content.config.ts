import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: ({ image }) => z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
    draft: z.boolean().default(false),
    cover: image().optional(),
    coverAlt: z.string().optional(),
  }).refine((data) => !data.updatedDate || data.updatedDate >= data.pubDate, { message: 'updatedDate 不能早于 pubDate', path: ['updatedDate'] })
    .refine((data) => !data.cover || Boolean(data.coverAlt?.trim()), { message: '有封面时请填写 coverAlt', path: ['coverAlt'] }),
});

export const collections = { posts };

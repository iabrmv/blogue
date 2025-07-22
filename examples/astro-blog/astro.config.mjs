import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://iabrmv.github.io',
  base: '/blogue',
  integrations: [mdx()],
});
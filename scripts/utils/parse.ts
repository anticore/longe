import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkBreaks from "remark-breaks";
import remarkWikilink from "remark-wiki-link";
import remarkObsidianImages from "./remarkObsidianImages";
import remarkEmbedder from "@remark-embedder/core";
import oembedTransformer from "@remark-embedder/transformer-oembed";
import fg from "fast-glob";
import { writeFile, cp } from "fs/promises";
import { matter } from "vfile-matter";
import { read } from "to-vfile";
import { encode } from "@msgpack/msgpack";

export const parseMd = async (mdFilePath: string) =>
  await unified()
    // eslint-disable-next-line
    .use(remarkEmbedder as any, {
      transformers: [oembedTransformer],
    })
    .use(remarkParse, { allowDangerousHtml: true })
    .use(remarkBreaks)
    .use(remarkObsidianImages)
    .use(remarkWikilink, {
      pathFormat: "obsidian",
      aliasDivider: "|",
      pageResolver: (name) => [name.replace(/ /g, "_")],
      hrefTemplate: (permalink) => `#/content/${permalink}.md`,
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkFrontmatter)
    .use(() => (_, file) => matter(file))
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(await read(mdFilePath));

export const parseVault = async () => {
  await cp("content/assets", "public/assets", { recursive: true });

  const vaultFiles = await fg("content/**/*.md");

  const result = await vaultFiles.reduce(async (accPromise, mdFilePath) => {
    const acc = await accPromise;
    const html = await parseMd(mdFilePath);
    return { ...acc, [mdFilePath]: html };
  }, Promise.resolve({}));

  writeFile("public/data.bson", encode(result), "binary");

  return result;
};

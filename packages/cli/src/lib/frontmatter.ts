import matter from 'gray-matter';

type FrontmatterValue =
  | string
  | number
  | boolean
  | ReadonlyArray<FrontmatterValue>
  | { readonly [key: string]: FrontmatterValue };

type Frontmatter = Record<string, FrontmatterValue>;

export interface MessageFrontmatter {
  created_at: string;
  topic: string;
  apple_note_id?: string;
}

interface ParsedMarkdown<T = Frontmatter> {
  frontmatter: T;
  content: string;
}

export function parseFrontmatter<T = Frontmatter>(markdown: string): ParsedMarkdown<T> {
  const { data, content } = matter(markdown);
  return {
    frontmatter: data as T,
    content: content.trim(),
  };
}

function stringifyFrontmatter(frontmatter: Frontmatter, content: string): string {
  return matter.stringify(content, frontmatter);
}

export function updateFrontmatter(markdown: string, updates: Frontmatter): string {
  const { frontmatter, content } = parseFrontmatter(markdown);
  const updatedFrontmatter = { ...frontmatter, ...updates };
  return stringifyFrontmatter(updatedFrontmatter, content);
}

export function removeFrontmatterFields(markdown: string, fields: string[]): string {
  const { frontmatter, content } = parseFrontmatter(markdown);
  const updated = { ...frontmatter };
  for (const field of fields) {
    delete updated[field];
  }
  return stringifyFrontmatter(updated, content);
}

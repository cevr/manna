import { Option } from 'effect';

interface MarkdownBlock {
  slug: string;
  title: string;
  markdown: string;
}

interface SplitMarkdown {
  folderTitle: string;
  blocks: MarkdownBlock[];
}

const SLUG_MAX = 60;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[*_`#>]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      .replace(/-+$/g, '') || 'section'
  );
}

const partShortLabel = (part: string): string => {
  const m = part.match(/^(Part\s+[A-Za-z0-9]+)\b/i);
  return m?.[1] ?? part;
};

const isSectionHeading = (line: string): boolean => /^##\s+\S/.test(line);

const isPartHeading = (line: string): boolean => /^#\s+Part\b/i.test(line);

const isH1 = (line: string): boolean => /^#\s+\S/.test(line) && !line.startsWith('##');

const headingText = (line: string): string =>
  line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+#*\s*$/, '')
    .trim();

interface OpenSection {
  title: string;
  lines: string[];
}

interface SplitState {
  folderTitle: string;
  currentPart: Option.Option<string>;
  blocks: MarkdownBlock[];
  prefaceLines: string[];
  section: Option.Option<OpenSection>;
}

const sectionTitle = (line: string, currentPart: Option.Option<string>): string => {
  const text = headingText(line);
  const isNumbered = /^\d+\./.test(text);
  const partLabel = Option.map(currentPart, partShortLabel);
  if (Option.isSome(partLabel) && isNumbered) return `${partLabel.value} — ${text}`;
  return text;
};

const closePreface = (state: SplitState): void => {
  const preface = state.prefaceLines.join('\n').trim();
  if (preface.length > 0) {
    state.blocks.push({
      slug: 'overview',
      title: 'Overview',
      markdown: preface,
    });
  }
  state.prefaceLines = [];
};

const closeSection = (state: SplitState): void => {
  if (Option.isNone(state.section)) return;
  const { title, lines } = state.section.value;
  state.blocks.push({
    slug: slugify(title),
    title,
    markdown: lines.join('\n').trim(),
  });
  state.section = Option.none();
};

const openSection = (state: SplitState, line: string): void => {
  if (Option.isNone(state.section)) {
    closePreface(state);
  } else {
    closeSection(state);
  }
  state.section = Option.some({ title: sectionTitle(line, state.currentPart), lines: [line] });
};

const appendLine = (state: SplitState, line: string): void => {
  if (Option.isSome(state.section)) {
    state.section.value.lines.push(line);
  } else {
    state.prefaceLines.push(line);
  }
};

export function splitMarkdownIntoSections(content: string): SplitMarkdown {
  const state: SplitState = {
    folderTitle: 'Untitled',
    currentPart: Option.none(),
    blocks: [],
    prefaceLines: [],
    section: Option.none(),
  };

  for (const line of content.split('\n')) {
    if (Option.isNone(state.section) && isH1(line) && state.folderTitle === 'Untitled') {
      state.folderTitle = headingText(line);
      continue;
    }

    if (isSectionHeading(line)) {
      openSection(state, line);
      continue;
    }

    if (isPartHeading(line)) {
      state.currentPart = Option.some(headingText(line));
      continue;
    }

    appendLine(state, line);
  }

  closeSection(state);

  const { folderTitle, blocks } = state;
  if (blocks.length === 0) {
    const preface = state.prefaceLines.join('\n').trim();
    let markdown = content.trim();
    if (preface.length > 0) markdown = preface;
    blocks.push({
      slug: 'overview',
      title: folderTitle,
      markdown,
    });
  }

  return { folderTitle, blocks };
}

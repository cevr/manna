import { Option } from 'effect';

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const inline = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)\*(\S.*?)\*(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

const TABLE_ROW = /^\s*\|/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;
const LIST_ITEM = /^(\s*)([-*]|\d+\.) (.*)$/;
const HEADING = /^(#{1,4}) (.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INDENTED = /^(?: {4}|\t)(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;

const tableRow = (line: string): string =>
  `<tr>${line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => `<td>${inline(cell.trim())}</td>`)
    .join('')}</tr>`;

type List = 'ul' | 'ol';

const listOf = (marker: string): List => {
  if (/^\d/.test(marker)) return 'ol';
  return 'ul';
};

const opening = (list: List, marker: string): string => {
  const from = Number.parseInt(marker, 10);
  if (list === 'ol' && from !== 1) return `<ol start="${from}">`;
  return `<${list}>`;
};

const pre = (lines: ReadonlyArray<string>): string =>
  `<pre><code>${escapeHtml(lines.join('\n'))}</code></pre>`;

const startsBlock = (line: string): boolean =>
  [TABLE_ROW, LIST_ITEM, HEADING, FENCE, QUOTE].some((starts) => starts.test(line));

const indentOf = (line: string): number => line.length - line.trimStart().length;

const writer = () => {
  const out: Array<string> = [];
  const lists: Array<List> = [];
  const columns: Array<number> = [];
  let table = false;
  let tag: 'p' | 'li' | 'none' = 'none';
  let words: Array<string> = [];
  let rested = false;
  const flush = () => {
    if (tag === 'p') out.push(`<p>${inline(words.join(' '))}</p>`);
    if (tag === 'li') out.push(inline(words.join(' ')));
    tag = 'none';
    words = [];
  };
  const closeLists = (to: number) => {
    columns.splice(to);
    for (const list of lists.splice(to).reverse()) out.push(`</li></${list}>`);
  };
  const closeTable = () => {
    if (table) out.push('</table>');
    table = false;
  };
  const end = () => {
    flush();
    closeLists(0);
    closeTable();
    rested = false;
  };
  return {
    end,
    codeMay: () => tag === 'none' && lists.length === 0 && table === false,
    row: (line: string) => {
      flush();
      closeLists(0);
      rested = false;
      if (!table) out.push('<table>');
      table = true;
      out.push(tableRow(line));
    },
    item: (indent: string, marker: string, text: string) => {
      closeTable();
      flush();
      rested = false;
      const list = listOf(marker);
      const want = Math.min(Math.floor(indent.length / 2) + 1, lists.length + 1);
      closeLists(want);
      if (lists.length === want && lists[want - 1] !== list) closeLists(want - 1);
      if (lists.length === want) out.push('</li><li>');
      else {
        out.push(opening(list, marker), '<li>');
        lists.push(list);
      }
      columns[want - 1] = indent.length + marker.length + 1;
      tag = 'li';
      words = [text];
    },
    heading: (level: number, text: string) => {
      end();
      out.push(`<h${level}>${inline(text)}</h${level}>`);
    },
    blank: () => {
      if (lists.length === 0) return end();
      flush();
      rested = true;
    },
    words: (line: string) => {
      closeTable();
      if (rested) {
        rested = false;
        closeLists(columns.filter((column) => column <= indentOf(line)).length);
      }
      if (tag === 'none') tag = 'p';
      words.push(line.trim());
    },
    block: (html: string) => {
      end();
      out.push(html);
    },
    done: () => {
      end();
      return out.join('');
    },
  };
};

type Writer = ReturnType<typeof writer>;

type Held =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Fence'; readonly marker: string; readonly lines: Array<string> }
  | { readonly _tag: 'Code'; readonly lines: Array<string>; blanks: number }
  | { readonly _tag: 'Quote'; readonly lines: Array<string> };

const NONE: Held = { _tag: 'None' };

const closes = (marker: string, line: string): boolean => {
  const fence = Option.fromNullishOr(FENCE.exec(line));
  return Option.exists(
    fence,
    (f) => String(f[1]).startsWith(marker) && line.trim().replaceAll(marker.charAt(0), '') === '',
  );
};

const flowLine = (html: Writer, line: string) => {
  if (TABLE_ROW.test(line)) {
    if (!TABLE_RULE.test(line)) html.row(line);
    return;
  }
  const item = Option.fromNullishOr(LIST_ITEM.exec(line));
  const heading = Option.fromNullishOr(HEADING.exec(line));
  if (Option.isSome(item))
    html.item(String(item.value[1]), String(item.value[2]), String(item.value[3]));
  else if (Option.isSome(heading))
    html.heading(String(heading.value[1]).length, String(heading.value[2]));
  else if (line.trim() === '') html.blank();
  else html.words(line);
};

const reader = (html: Writer) => {
  let held: Held = NONE;
  const release = () => {
    if (held._tag === 'Fence') html.block(pre(held.lines));
    if (held._tag === 'Code') html.block(pre(held.lines));
    if (held._tag === 'Quote')
      html.block(`<blockquote>${markdownHtml(held.lines.join('\n'))}</blockquote>`);
    held = NONE;
  };
  const fenced = (fence: Extract<Held, { _tag: 'Fence' }>, line: string) => {
    if (closes(fence.marker, line)) release();
    else fence.lines.push(line);
  };
  const coded = (code: Extract<Held, { _tag: 'Code' }>, line: string): boolean => {
    const more = Option.fromNullishOr(INDENTED.exec(line));
    if (Option.isSome(more)) {
      code.lines.push(...Array.from({ length: code.blanks }, () => ''), String(more.value[1]));
      code.blanks = 0;
      return true;
    }
    if (line.trim() === '') {
      code.blanks += 1;
      return true;
    }
    release();
    return false;
  };
  const quoted = (quote: Extract<Held, { _tag: 'Quote' }>, line: string): boolean => {
    const more = Option.fromNullishOr(QUOTE.exec(line));
    const last = quote.lines.at(-1) ?? '';
    if (Option.isSome(more)) quote.lines.push(String(more.value[1]));
    else if (line.trim() !== '' && last.trim() !== '' && !startsBlock(line)) quote.lines.push(line);
    else {
      release();
      return line.trim() === '';
    }
    return true;
  };
  const opens = (line: string) => {
    const fence = Option.fromNullishOr(FENCE.exec(line));
    const quote = Option.fromNullishOr(QUOTE.exec(line));
    const code = Option.filter(Option.fromNullishOr(INDENTED.exec(line)), () => html.codeMay());
    if (Option.isSome(fence)) {
      html.end();
      held = { _tag: 'Fence', marker: String(fence.value[1]), lines: [] };
    } else if (Option.isSome(quote)) {
      html.end();
      held = { _tag: 'Quote', lines: [String(quote.value[1])] };
    } else if (Option.isSome(code))
      held = { _tag: 'Code', lines: [String(code.value[1])], blanks: 0 };
    else flowLine(html, line);
  };
  const read = (line: string) => {
    if (held._tag === 'Fence') return fenced(held, line);
    if (held._tag === 'Code' && coded(held, line)) return;
    if (held._tag === 'Quote' && quoted(held, line)) return;
    opens(line);
  };
  return {
    read,
    done: () => {
      release();
      return html.done();
    },
  };
};

export const markdownHtml = (text: string): string => {
  const lines = reader(writer());
  for (const line of text.split('\n')) lines.read(line);
  return lines.done();
};

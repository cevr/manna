import { Predicate, Schema } from 'effect';
import { Parser } from 'htmlparser2';

export const Text = Schema.Struct({
  _tag: Schema.tag('Text'),
  text: Schema.String,
});
export type Text = typeof Text.Type;

const LineBreak = Schema.Struct({
  _tag: Schema.tag('LineBreak'),
});
type LineBreak = typeof LineBreak.Type;

const PageBreak = Schema.Struct({
  _tag: Schema.tag('PageBreak'),
  page: Schema.Finite,
});
type PageBreak = typeof PageBreak.Type;

interface Emphasis {
  readonly _tag: 'Emphasis';
  readonly children: readonly Node[];
}
const Emphasis: Schema.Codec<Emphasis> = Schema.Struct({
  _tag: Schema.tag('Emphasis'),
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

interface Comment {
  readonly _tag: 'Comment';
  readonly children: readonly Node[];
}
const Comment: Schema.Codec<Comment> = Schema.Struct({
  _tag: Schema.tag('Comment'),
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

interface ScriptureRef {
  readonly _tag: 'ScriptureRef';
  readonly title: string;
  readonly dataLink: string;
  readonly children: readonly Node[];
}
const ScriptureRef: Schema.Codec<ScriptureRef> = Schema.Struct({
  _tag: Schema.tag('ScriptureRef'),
  title: Schema.String,
  dataLink: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

interface BookRef {
  readonly _tag: 'BookRef';
  readonly title: string;
  readonly dataLink: string;
  readonly children: readonly Node[];
}
const BookRef: Schema.Codec<BookRef> = Schema.Struct({
  _tag: Schema.tag('BookRef'),
  title: Schema.String,
  dataLink: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

interface Unknown {
  readonly _tag: 'Unknown';
  readonly tag: string;
  readonly className: string;
  readonly children: readonly Node[];
}
const Unknown: Schema.Codec<Unknown> = Schema.Struct({
  _tag: Schema.tag('Unknown'),
  tag: Schema.String,
  className: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

export type Node =
  | Text
  | LineBreak
  | PageBreak
  | Emphasis
  | Comment
  | ScriptureRef
  | BookRef
  | Unknown;
export const Node: Schema.Codec<Node> = Schema.Union([
  Text,
  LineBreak,
  PageBreak,
  Emphasis,
  Comment,
  ScriptureRef,
  BookRef,
  Unknown,
]);

interface Frame {
  readonly children: Node[];
  /** Called on element close. Pushes the produced node into the parent frame. */
  readonly close: (children: readonly Node[]) => Node;
}

const spanClose = (attribs: Record<string, string>): ((children: readonly Node[]) => Node) => {
  const className = attribs['class'] ?? '';
  const classes = className.split(/\s+/);

  if (classes.includes('page-break')) {
    const raw = attribs['data-page'] ?? '';
    const page = Number.parseInt(raw, 10);
    return () => {
      if (Number.isFinite(page)) return { _tag: 'PageBreak', page };
      return { _tag: 'PageBreak', page: 0 };
    };
  }

  if (classes.includes('egwlink_bible')) {
    return (children) => ({
      _tag: 'ScriptureRef',
      title: attribs['title'] ?? '',
      dataLink: attribs['data-link'] ?? '',
      children,
    });
  }

  if (classes.includes('egwlink_book')) {
    return (children) => ({
      _tag: 'BookRef',
      title: attribs['title'] ?? '',
      dataLink: attribs['data-link'] ?? '',
      children,
    });
  }

  if (classes.includes('non-egw-comment')) {
    return (children) => ({ _tag: 'Comment', children });
  }

  return (children) => ({ _tag: 'Unknown', tag: 'span', className, children });
};

const tagClose = (name: string, attribs: Record<string, string>): Frame['close'] => {
  if (name === 'em') return (children) => ({ _tag: 'Emphasis', children });
  if (name === 'span') return spanClose(attribs);
  return (children) => ({
    _tag: 'Unknown',
    tag: name,
    className: attribs['class'] ?? '',
    children,
  });
};

/**
 * Parse the inline HTML inside a single EGW paragraph's `content` field into
 * the AST. Pure, sync, deterministic — safe to call from renderer or main.
 *
 * Streaming parser + frame stack: each opentag pushes a frame; ontext appends
 * to the current frame's children; onclosetag pops and constructs the node.
 */
export const parseParagraphContent = (html: string): readonly Node[] => {
  const root: Frame = { children: [], close: () => ({ _tag: 'Text', text: '' }) };
  const stack: Frame[] = [root];
  const top = (): Frame => {
    const t = stack[stack.length - 1];
    if (Predicate.isUndefined(t)) return root;
    return t;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === 'br') {
          top().children.push({ _tag: 'LineBreak' });
          return;
        }
        stack.push({ children: [], close: tagClose(name, attribs) });
      },
      ontext(text) {
        if (text.length === 0) return;
        const frame = top();
        const last = frame.children[frame.children.length - 1];
        if (Predicate.isNotUndefined(last) && last._tag === 'Text') {
          frame.children[frame.children.length - 1] = { _tag: 'Text', text: last.text + text };
        } else {
          frame.children.push({ _tag: 'Text', text });
        }
      },
      onclosetag(name) {
        if (name === 'br') return;
        const finished = stack.pop();
        if (Predicate.isUndefined(finished) || stack.length === 0) {
          return;
        }
        top().children.push(finished.close(finished.children));
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();

  return root.children;
};

/**
 * Flatten the AST into a plain-text string. Used by pretext height estimation
 * (which works off text + font, not DOM). Line breaks become spaces — we just
 * want the wrappable token stream, not the visual layout.
 */
export const nodesToText = (nodes: readonly Node[]): string => {
  let out = '';
  for (const node of nodes) {
    switch (node._tag) {
      case 'Text':
        out += node.text;
        break;
      case 'LineBreak':
        out += ' ';
        break;
      case 'PageBreak':
        out += String(node.page);
        break;
      case 'Emphasis':
      case 'Comment':
      case 'ScriptureRef':
      case 'BookRef':
      case 'Unknown':
        out += nodesToText(node.children);
        break;
    }
  }
  return out;
};

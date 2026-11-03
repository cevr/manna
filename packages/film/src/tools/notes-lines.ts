import { Option } from 'effect';
import type { Note } from '../core/schema.ts';
import { sketchSummary } from '../core/sketch.ts';

const quoted = (text: string) =>
  `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;

const fields = (note: Note) => {
  const cue = Option.map(Option.fromNullishOr(note.cue), (c) => ` cue=${c.name}:${c.edge}`);
  const mark = Option.map(Option.fromNullishOr(note.mark), (m) => ` mark=${m}`);
  const range = Option.map(
    Option.fromNullishOr(note.range),
    (r) => ` range=${r.from.toFixed(2)}-${r.to.toFixed(2)}`,
  );
  const source = Option.map(
    Option.fromNullishOr(note.source),
    (s) => ` source=${s.file}:${s.line} line=${quoted(s.text)}`,
  );
  const words = Option.map(
    Option.fromNullishOr(note.words),
    (w) => ` words=${w.beat}:${w.from}-${w.to} said=${quoted(w.text)}`,
  );
  const kind = Option.map(Option.fromNullishOr(note.kind), (k) => ` kind=${k}`);
  const replace = Option.map(Option.fromNullishOr(note.replace), (r) => ` replace=${quoted(r)}`);
  const box = Option.map(
    Option.fromNullishOr(note.box),
    (b) => ` box=${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)}`,
  );
  const ink = Option.map(Option.fromNullishOr(note.ink), (strokes) => ` ink=${strokes.length}`);
  const panel = Option.map(
    Option.fromNullishOr(note.panel),
    (p) =>
      ` panel=${p.id}${Option.match(Option.fromUndefinedOr(p.try), { onNone: () => '', onSome: (n) => ` try=${n}` })} ask=${p.ask ?? 'note'}`,
  );
  const sketch = Option.map(
    Option.filter(Option.fromNullishOr(note.sketch), (s) => s.length > 0),
    (s) => ` sketch=${quoted(sketchSummary(s))}`,
  );
  const local = Option.match(Option.fromNullishOr(note.local), {
    onNone: () => '',
    onSome: (s) => ` local=${s.toFixed(2)}`,
  });
  return [
    `scene=${note.scene} T=${note.T.toFixed(2)}${local} frame=${note.frame}`,
    ...[cue, mark, range, source, words, kind, replace, panel, sketch, box, ink].map((field) =>
      Option.getOrElse(field, () => ''),
    ),
  ].join('');
};

export const noteLine = (note: Note & { readonly stillFile: string }, seq: number) =>
  `note id=${note.id} seq=${seq} status=${note.status} ${fields(note)} replies=${note.thread.length} still=${note.stillFile} text=${quoted(note.text)}`;

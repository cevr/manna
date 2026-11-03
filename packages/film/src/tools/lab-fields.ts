import { Array as Arr, Option, Predicate, Schema } from 'effect';
import type { JsonSchema } from 'effect';
import type * as Tool from 'effect/ai/Tool';

export type FieldKind = 'word' | 'number' | 'switch' | 'words' | 'numbers' | 'json';

type Primitive = 'word' | 'number' | 'switch';

export interface LabField {
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly description: string;
}

const isJsonArray = Schema.is(Schema.Array(Schema.Json));

const Node = Schema.Struct({
  $ref: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.Json),
  enum: Schema.optionalKey(Schema.Array(Schema.Json)),
  const: Schema.optionalKey(Schema.Json),
  anyOf: Schema.optionalKey(Schema.Array(Schema.Json)),
  oneOf: Schema.optionalKey(Schema.Array(Schema.Json)),
  items: Schema.optionalKey(Schema.Json),
  prefixItems: Schema.optionalKey(Schema.Json),
  properties: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  required: Schema.optionalKey(Schema.Array(Schema.String)),
  description: Schema.optionalKey(Schema.String),
});
type Node = typeof Node.Type;
const readNode = Schema.decodeUnknownOption(Node);
const NO_NODE: Node = {};

const PRIMITIVES = new Map<Schema.Json, Primitive>([
  ['string', 'word'],
  ['integer', 'number'],
  ['number', 'number'],
  ['boolean', 'switch'],
]);

const LISTS = new Map<Primitive, FieldKind>([
  ['word', 'words'],
  ['number', 'numbers'],
]);

const resolved = (node: Node, defs: JsonSchema.Definitions): Node =>
  Option.fromUndefinedOr(node.$ref).pipe(
    Option.flatMap((ref) => Option.fromUndefinedOr(defs[ref.replace(/^#\/\$defs\//, '')])),
    Option.flatMap(readNode),
    Option.match({ onNone: () => node, onSome: (target) => resolved(target, defs) }),
  );

const unionOf = (
  union: ReadonlyArray<Schema.Json>,
  defs: JsonSchema.Definitions,
): Option.Option<Primitive> => {
  const kinds = union.map((one) =>
    Option.flatMap(readNode(one), (node) => primitiveOf(node, defs)),
  );
  return Option.filter(Option.flatten(Arr.head(kinds)), (kind) =>
    kinds.every((k) => Option.contains(k, kind)),
  );
};

const primitiveOf = (node: Node, defs: JsonSchema.Definitions): Option.Option<Primitive> => {
  const at = resolved(node, defs);
  const word = Option.some<Primitive>('word');
  return Option.fromUndefinedOr(at.type).pipe(
    Option.flatMap((type) => Option.fromUndefinedOr(PRIMITIVES.get(type))),
    Option.orElse(() =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(at.enum), (all) => all.every(Predicate.isString)),
        () => word,
      ),
    ),
    Option.orElse(() =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(at.const), Predicate.isString),
        () => word,
      ),
    ),
    Option.orElse(() =>
      Option.flatMap(
        Option.orElse(Option.fromUndefinedOr(at.anyOf), () => Option.fromUndefinedOr(at.oneOf)),
        (union) => unionOf(union, defs),
      ),
    ),
  );
};

const listOf = (at: Node, defs: JsonSchema.Definitions): Option.Option<FieldKind> => {
  const itemKinds = [
    ...Option.toArray(Option.fromUndefinedOr(at.items)),
    ...Option.getOrElse(
      Option.filter(Option.fromUndefinedOr(at.prefixItems), isJsonArray),
      (): ReadonlyArray<Schema.Json> => [],
    ),
  ].map((item) => Option.flatMap(readNode(item), (node) => primitiveOf(node, defs)));
  return Option.filter(Option.flatten(Arr.head(itemKinds)), (kind) =>
    itemKinds.every((k) => Option.contains(k, kind)),
  ).pipe(
    Option.filter(() => at.type === 'array'),
    Option.flatMap((kind) => Option.fromUndefinedOr(LISTS.get(kind))),
  );
};

const kindOf = (node: Node, defs: JsonSchema.Definitions): FieldKind => {
  const at = resolved(node, defs);
  return Option.getOrElse(
    Option.orElse(primitiveOf(at, defs), () => listOf(at, defs)),
    (): FieldKind => 'json',
  );
};

export const fieldsOf = (tool: Tool.Any): ReadonlyArray<LabField> => {
  const document = Schema.toJsonSchemaDocument(tool.parametersSchema);
  const defs = document.definitions;
  const root = resolved(
    Option.getOrElse(readNode(document.schema), () => NO_NODE),
    defs,
  );
  const required = Option.getOrElse(
    Option.fromUndefinedOr(root.required),
    (): ReadonlyArray<string> => [],
  );
  const properties = Option.getOrElse(Option.fromUndefinedOr(root.properties), () => ({}));
  return Object.entries(properties).flatMap(([name, value]) =>
    Option.toArray(
      Option.map(readNode(value), (node) => ({
        name,
        kind: kindOf(node, defs),
        required: required.includes(name),
        description: Option.getOrElse(
          Option.orElse(Option.fromUndefinedOr(resolved(node, defs).description), () =>
            Option.fromUndefinedOr(node.description),
          ),
          () => '',
        ),
      })),
    ),
  );
};

const RefRoot = Schema.Struct({ $ref: Schema.String });
const isRefRoot = Schema.is(RefRoot);

export const objectSchema = (schema: Schema.Top, excess: 'ignore' | 'error' = 'ignore') => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: excess });
  const { definitions } = document;
  const root = Option.liftPredicate(document.schema, isRefRoot).pipe(
    Option.flatMap((ref) =>
      Option.fromUndefinedOr(definitions[ref.$ref.replace(/^#\/\$defs\//, '')]),
    ),
    Option.getOrElse(() => document.schema),
  );
  return Arr.match(Object.keys(definitions), {
    onEmpty: () => root,
    onNonEmpty: () => ({ ...root, $defs: definitions }),
  });
};

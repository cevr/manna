import { Option, Predicate, Schema, SchemaGetter } from 'effect';

import { Node, parseParagraphContent } from './ast.js';

const OptionFromOptionalNullishOrEmpty: Schema.decodeTo<
  Schema.Option<Schema.String>,
  Schema.optional<Schema.NullOr<Schema.String>>
> = Schema.optional(Schema.NullOr(Schema.String)).pipe(
  Schema.decodeTo(Schema.Option(Schema.String), {
    decode: SchemaGetter.transformOptional((oe) =>
      oe.pipe(
        Option.filter((v): v is string => Predicate.isNotNull(v) && v !== ''),
        Option.some,
      ),
    ),
    encode: SchemaGetter.transformOptional((ot) => Option.flatten(ot)),
  }),
);

export const TextDirection = Schema.Literals(['ltr', 'rtl']);

export type TextDirection = Schema.Schema.Type<typeof TextDirection>;

export const BookType = Schema.String;

export type BookType = Schema.Schema.Type<typeof BookType>;

export const PermissionRequired = Schema.Literals([
  'hidden',
  'public',
  'authenticated',
  'purchased',
]);

export type PermissionRequired = Schema.Schema.Type<typeof PermissionRequired>;

export const Language = Schema.Struct({
  code: Schema.String,
  name: Schema.String,
  direction: TextDirection,
});

export type Language = Schema.Schema.Type<typeof Language>;

const folderFields = {
  folder_id: Schema.Finite,
  name: Schema.String,
  add_class: Schema.String,
  nbooks: Schema.Finite,
  naudiobooks: Schema.Finite,
  sort_order: Schema.optional(Schema.Finite),
  parent_id: Schema.optional(Schema.Finite),
};

export interface Folder extends Schema.Struct.Type<typeof folderFields> {
  readonly children?: ReadonlyArray<Folder>;
}

export const Folder: Schema.Codec<Folder> = Schema.Struct({
  ...folderFields,
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Codec<Folder> => Folder))),
});

export const BookCover = Schema.Struct({
  small: Schema.optional(Schema.NullOr(Schema.String)),
  large: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BookCover = Schema.Schema.Type<typeof BookCover>;

export const BookFiles = Schema.Struct({
  mp3: Schema.optional(Schema.NullOr(Schema.String)),
  pdf: Schema.optional(Schema.NullOr(Schema.String)),
  epub: Schema.optional(Schema.NullOr(Schema.String)),
  mobi: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BookFiles = Schema.Schema.Type<typeof BookFiles>;

export const Book = Schema.Struct({
  book_id: Schema.Finite,
  code: Schema.String,
  lang: Schema.String,
  type: BookType,
  subtype: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  first_para: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  npages: Schema.Finite,
  isbn: Schema.optional(Schema.NullOr(Schema.String)),
  publisher: Schema.optional(Schema.NullOr(Schema.String)),
  pub_year: Schema.String,
  buy_link: Schema.optional(Schema.NullOr(Schema.String)),
  folder_id: Schema.Finite,
  folder_color_group: Schema.optional(Schema.NullOr(Schema.String)),
  cover: BookCover,
  files: BookFiles,
  download: Schema.optional(Schema.NullOr(Schema.String)),
  last_modified: Schema.optional(Schema.NullOr(Schema.String)),
  permission_required: PermissionRequired,
  sort: Schema.Finite,
  is_audiobook: Schema.Boolean,
  cite: Schema.optional(Schema.NullOr(Schema.String)),
  original_book: Schema.optional(Schema.NullOr(Schema.String)),
  translated_into: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  nelements: Schema.Finite,
});

export type Book = Schema.Schema.Type<typeof Book>;

export const TocItem = Schema.Struct({
  para_id: OptionFromOptionalNullishOrEmpty,
  level: Schema.Finite,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: OptionFromOptionalNullishOrEmpty,
  dup: Schema.optional(Schema.NullOr(Schema.String)),
  mp3: Schema.optional(Schema.NullOr(Schema.String)),
  puborder: Schema.Finite,
});

export type TocItem = Schema.Schema.Type<typeof TocItem>;

export const Paragraph = Schema.Struct({
  para_id: OptionFromOptionalNullishOrEmpty,
  id_prev: Schema.optional(Schema.NullOr(Schema.String)),
  id_next: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_1: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_2: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_3: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_4: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: OptionFromOptionalNullishOrEmpty,
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  element_type: Schema.optional(Schema.NullOr(Schema.String)),
  element_subtype: Schema.optional(Schema.NullOr(Schema.String)),
  nodes: Schema.Array(Node),
  puborder: Schema.Finite,
});

export type Paragraph = Schema.Schema.Type<typeof Paragraph>;

const ParagraphWire = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  id_prev: Schema.optional(Schema.NullOr(Schema.String)),
  id_next: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_1: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_2: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_3: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_4: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  element_type: Schema.optional(Schema.NullOr(Schema.String)),
  element_subtype: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.optional(Schema.NullOr(Schema.String)),
  puborder: Schema.Finite,
});

export const ParagraphFromHtml = ParagraphWire.pipe(
  Schema.decodeTo(Paragraph, {
    decode: SchemaGetter.transform((wire) => {
      const html = wire.content ?? '';
      let nodes: readonly Node[] = [];
      if (html !== '') nodes = parseParagraphContent(html);
      return {
        para_id: wire.para_id,
        id_prev: wire.id_prev,
        id_next: wire.id_next,
        refcode_1: wire.refcode_1,
        refcode_2: wire.refcode_2,
        refcode_3: wire.refcode_3,
        refcode_4: wire.refcode_4,
        refcode_short: wire.refcode_short,
        refcode_long: wire.refcode_long,
        element_type: wire.element_type,
        element_subtype: wire.element_subtype,
        nodes,
        puborder: wire.puborder,
      };
    }),
    encode: SchemaGetter.forbidden(
      () => 'Paragraph → ParagraphWire encoding not supported (AST→HTML round-trip).',
    ),
  }),
);

export const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  token_type: Schema.String,
  expires_in: Schema.Finite,
  scope: Schema.String,
});

export type TokenResponse = Schema.Schema.Type<typeof TokenResponse>;

export const TokenInfo = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.optional(Schema.String),
  expiresAt: Schema.Finite,
  scope: Schema.String,
});

export type TokenInfo = Schema.Schema.Type<typeof TokenInfo>;

export const SearchParams = Schema.Struct({
  query: Schema.String,
  lang: Schema.optional(Schema.String),
  folder: Schema.optional(Schema.Finite),
  book: Schema.optional(Schema.Finite),
  highlight: Schema.optional(Schema.Boolean),
  limit: Schema.optional(Schema.Finite),
  offset: Schema.optional(Schema.Finite),
});

export type SearchParams = Schema.Schema.Type<typeof SearchParams>;

export const BooksQueryParams = Schema.Struct({
  pubnr: Schema.optional(Schema.Array(Schema.Finite)),
  since: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Array(BookType)),
  lang: Schema.optional(Schema.String),
  can_read: Schema.optional(Schema.String),
  has_mp3: Schema.optional(Schema.String),
  has_pdf: Schema.optional(Schema.String),
  has_epub: Schema.optional(Schema.String),
  has_mobi: Schema.optional(Schema.String),
  has_book: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Finite),
  search: Schema.optional(Schema.String),
  folder: Schema.optional(Schema.Finite),
  trans: Schema.optional(Schema.Union([Schema.Literal('all'), Schema.String])),
  limit: Schema.optional(Schema.Finite),
  offset: Schema.optional(Schema.Finite),
});

export type BooksQueryParams = Schema.Schema.Type<typeof BooksQueryParams>;

export const ChapterContentParams = Schema.Struct({
  highlight: Schema.optional(Schema.String),
  trans: Schema.optional(
    Schema.Union([Schema.Literal('all'), Schema.Array(Schema.String), Schema.String]),
  ),
});

export type ChapterContentParams = Schema.Schema.Type<typeof ChapterContentParams>;

export const SearchHit = Schema.Struct({
  index: Schema.optional(Schema.Finite),
  lang: Schema.String,
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  pub_code: Schema.String,
  pub_name: Schema.String,
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  pub_year: Schema.optional(Schema.NullOr(Schema.String)),
  snippet: Schema.optional(Schema.NullOr(Schema.String)),
  weight: Schema.optional(Schema.Finite),
  group: Schema.optional(Schema.String),
  action_required: Schema.optional(Schema.String),
});

export type SearchHit = Schema.Schema.Type<typeof SearchHit>;

export const SearchResponse = Schema.Struct({
  next: Schema.NullOr(Schema.String),
  previous: Schema.NullOr(Schema.String),
  total: Schema.Finite,
  count: Schema.Finite,
  results: Schema.Array(SearchHit),
});

export type SearchResponse = Schema.Schema.Type<typeof SearchResponse>;

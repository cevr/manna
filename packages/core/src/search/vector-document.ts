import { Option } from 'effect';

interface VectorDocumentRow {
  readonly bookCode: string;
  readonly refCode: string;
  readonly paraId: Option.Option<string>;
  readonly refcodeShort: Option.Option<string>;
  readonly contentText: string;
}

interface VectorDocument {
  readonly bookCode: string;
  readonly paraId: string;
  readonly refcode: string;
  readonly text: string;
}

export const vectorDocument = (row: VectorDocumentRow): Option.Option<VectorDocument> => {
  const paraId = Option.getOrElse(row.paraId, () => '');
  if (paraId.length === 0) return Option.none();
  const refcode = Option.getOrElse(row.refcodeShort, () => row.refCode);
  if (refcode.length === 0) return Option.none();
  const text = row.contentText.trim();
  if (text.length === 0) return Option.none();
  return Option.some({ bookCode: row.bookCode, paraId, refcode, text });
};

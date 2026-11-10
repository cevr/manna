/**
 * The native sources the app's latest process refused, read from its log
 * (`log show --style ndjson`). One refuses a JavaScript call into a native
 * module, method or view the installed build lacks or holds in another
 * shape, and every such refusal ends `; rebuild the app`; a preserved
 * install serving new JavaScript shows itself only there.
 */
import { Option, Schema } from 'effect';

/** One record of the log: the process that wrote it and its message, any other field ignored. */
const LogRecord = Schema.fromJsonString(
  Schema.Struct({ processID: Schema.Finite, eventMessage: Schema.String }),
);
const decodeRecord = Schema.decodeUnknownOption(LogRecord);

/** What every refusal of a native source writes. */
const REFUSAL = '; rebuild the app';

/**
 * The messages, in order, of the refusals of the log's latest process (the
 * last record's): each record of it whose message holds `; rebuild the
 * app` on any of its lines. A line that is no record (the header, the
 * closing count, a record whose pid is not a number) is skipped, and a
 * refusal of an earlier process (before a rebuild or a relaunch) counts
 * for nothing.
 */
export const nativeRefusals = (text: string): ReadonlyArray<string> => {
  const records = text.split('\n').flatMap((line) => Option.toArray(decodeRecord(line)));
  const latest = records.at(-1)?.processID;
  return records
    .filter(({ processID, eventMessage }) => processID === latest && eventMessage.includes(REFUSAL))
    .map(({ eventMessage }) => eventMessage);
};

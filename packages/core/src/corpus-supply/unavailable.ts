import { Option } from 'effect';

type UnavailableReason = 'subscription' | 'third-party-licence';

interface UnavailablePublication {
  readonly bookId: number;
  readonly code: string;
  readonly reason: UnavailableReason;
}

export const KNOWN_UNAVAILABLE: readonly UnavailablePublication[] = [
  { bookId: 12515, code: '1SDABC', reason: 'subscription' },
  { bookId: 12511, code: '2SDABC', reason: 'subscription' },
  { bookId: 12516, code: '3SDABC', reason: 'subscription' },
  { bookId: 12513, code: '4SDABC', reason: 'subscription' },
  { bookId: 12514, code: '5SDABC', reason: 'subscription' },
  { bookId: 12518, code: '6SDABC', reason: 'subscription' },
  { bookId: 12517, code: '7SDABC', reason: 'subscription' },
  { bookId: 12362, code: 'EGWEnc', reason: 'subscription' },
  { bookId: 12668, code: 'SDAEnc', reason: 'subscription' },
  { bookId: 12666, code: 'HSDAT', reason: 'subscription' },
  { bookId: 12669, code: 'SDASB', reason: 'subscription' },
  { bookId: 14720, code: 'ABC-OT', reason: 'subscription' },
  { bookId: 14721, code: 'ABC-NT', reason: 'subscription' },
  { bookId: 14334, code: 'NKJV', reason: 'third-party-licence' },
  { bookId: 14340, code: 'NIV', reason: 'third-party-licence' },
  { bookId: 14341, code: 'NET', reason: 'third-party-licence' },
  { bookId: 14419, code: 'ICB', reason: 'third-party-licence' },
  { bookId: 14420, code: 'NCV', reason: 'third-party-licence' },
];

const BY_ID: ReadonlyMap<number, UnavailablePublication> = new Map(
  KNOWN_UNAVAILABLE.map((entry) => [entry.bookId, entry]),
);

export const isKnownUnavailable = (bookId: number): boolean => BY_ID.has(bookId);

export const unavailableReason = (bookId: number): Option.Option<UnavailableReason> =>
  Option.fromNullishOr(BY_ID.get(bookId)).pipe(Option.map((entry) => entry.reason));

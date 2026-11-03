import { Option, Schema } from 'effect';

export const Address = Schema.String.pipe(Schema.brand('Address'));
export type Address = typeof Address.Type;

const MAX_LENGTH = 254;
const MAX_LOCAL = 64;

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP = /^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/;

export const addressOf = (typed: string): Option.Option<Address> => {
  const address = typed.trim().toLowerCase();
  if (address.length > MAX_LENGTH) return Option.none();
  const at = address.lastIndexOf('@');
  const local = address.slice(0, at);
  const labels = address.slice(at + 1).split('.');
  const top = labels.at(-1) ?? '';
  const valid =
    at > 0 &&
    local.length <= MAX_LOCAL &&
    LOCAL.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    TOP.test(top);
  if (!valid) return Option.none();
  return Option.some(Address.make(address));
};

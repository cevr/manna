import { Option, Record, Schema } from 'effect';
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { color, useAccent } from './color';

export interface StackRoute {
  readonly name: string;
  readonly params?: unknown;
}

export interface Header {
  readonly title: string;
  readonly headerRight?: () => ReactNode;
}

export type RouteParams = Readonly<Record<string, string>>;

export type Headers = Readonly<Record<string, (params: RouteParams) => Header>>;

const decodeParams = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.String));

export const stackOptions =
  (accent: ColorValue, headers: Headers) =>
  ({ route }: { readonly route: StackRoute }) => ({
    contentStyle: { backgroundColor: color.ground },
    headerStyle: { backgroundColor: color.ground },
    headerTintColor: accent,
    headerTitleStyle: { color: color.ink },
    headerLargeTitleStyle: { color: color.ink },
    ...Option.match(Record.get(headers, route.name), {
      onNone: () => ({}),
      onSome: (header) => header(Option.getOrElse(decodeParams(route.params), () => ({}))),
    }),
  });

export const useStackOptions = (headers: Headers) => stackOptions(useAccent(), headers);

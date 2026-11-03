import { Option } from 'effect';
import type { FlatList } from 'react-native';

export const scrolled = <Item>(_: FlatList<Item>): Option.Option<number> => Option.none();

export const told = <Item>(_: FlatList<Item>): void => {};

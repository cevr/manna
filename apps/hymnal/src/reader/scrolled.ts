import { Option } from 'effect';
import type { FlatList } from 'react-native';

export const scrolled = <Item>(list: FlatList<Item>): Option.Option<number> => {
  const node: HTMLElement = list.getScrollableNode();
  return Option.some(node.scrollTop);
};

export const told = <Item>(list: FlatList<Item>): void => {
  const node: HTMLElement = list.getScrollableNode();
  node.dispatchEvent(new Event('scroll'));
};

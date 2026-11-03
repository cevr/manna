import { Match } from 'effect';
import {
  type DependencyList,
  type EffectCallback,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
} from 'react';
import { View } from 'react-native';

import type { StackState } from '~/player/title';

export const opened: Array<string> = [];

export const opening = new Set<(href: string) => void>();

type Press = (event?: MouseEvent) => void;

export function useLinkTo({
  href,
  replace = false,
}: {
  readonly href: string;
  readonly replace?: boolean;
}) {
  const onPress: Press = (event) => {
    if (event?.defaultPrevented) return;
    if (
      event &&
      (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    )
      return;
    event?.preventDefault();
    if (replace) {
      routed.push(`replace ${href}`);
      return;
    }
    opened.push(href);
    for (const open of opening) open(href);
  };
  return { href, role: 'link' as const, onPress };
}

export const Link = {
  resolveHref: (
    href: string | { readonly pathname: string; readonly params: Record<string, string> },
  ): string =>
    Match.value(href).pipe(
      Match.when(Match.string, (path) => path),
      Match.orElse(({ pathname, params: query }) =>
        [pathname, String(new URLSearchParams(query))].filter(Boolean).join('?'),
      ),
    ),
};

export const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

export const useSafeAreaInsets = () => safeArea;

export const params: Record<string, string> = {};

export const pathname = { current: '/' };

export const usePathname = () => pathname.current;

export const useParams = <T,>() => params as T;

export const paramsSet: Array<Record<string, string>> = [];

export const stack: Shown = { state: { routes: [], index: 0 } };

interface Shown {
  state: StackState;
}

export const routed: Array<string> = [];

export const useRouter = () => ({
  setParams: (next: Record<string, string>) => {
    paramsSet.push(next);
    Object.assign(params, next);
  },
  back: () => void routed.push('back'),
  dismissAll: () => void routed.push('dismissAll'),
  push: (href: string) => void routed.push(`push ${href}`),
  replace: (href: string) => void routed.push(`replace ${href}`),
});

export const useNavigation = () => ({
  getState: () => stack.state,
  isFocused: () => true,
});

export function useFocusEffect(effect: EffectCallback, deps: DependencyList = []) {
  useEffect(effect, deps);
}

export const Stack = {
  Screen: ({
    options,
  }: {
    readonly options: { readonly title?: string; readonly headerRight?: () => ReactNode };
  }) => (
    <View testID="header" aria-label={options.title}>
      {options.headerRight?.()}
    </View>
  ),
};

export const awake = new Set<string>();

export function useKeepAwake() {
  const id = useId();
  useEffect(() => {
    awake.add(id);
    return () => void awake.delete(id);
  }, [id]);
}

export const One = {};

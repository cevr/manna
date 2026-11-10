/**
 * The hymn route's screen on a phone, pushed over the home screen from its
 * list or its search: a pager of hymn pages a reader swipes left or right
 * through. It pages through the list the reader pressed the hymn's row in
 * (`pagesFrom`), else through every hymn in number order (`pageSource`), and
 * the ends do not wrap.
 *
 * Every page is one screen wide (`getFixedItemSize`), so the pager opens at
 * the hymn's page on its first frame (`initialScrollIndex`), even at hymn
 * 600, and draws one page on each side of the one shown. A page scrolls up
 * and down on its own; the pager moves only sideways.
 *
 * The route follows the page the pager settles on (`settledAt`), never a
 * page passed mid-swipe: the screen sets the route's number in place
 * (`setParams`, no push), so Back returns to the list in one step. The
 * header follows the route's number where the stack is laid out
 * (`hymnHeader`), and the screen, not its pages, tells the bottom bar the
 * page shown (`Shown`): a neighbour page sets nothing, and a swipe never
 * touches the player. While the player holds no hymn, the screen draws the
 * bar as its own under the pager (`PageBar`), so a back takes it out with the
 * screen, frame for frame, and a push brings it in.
 *
 * A pan that starts at the screen's left edge pops the screen, as on every
 * other pushed screen: a strip `backEdge` points wide lies over the pager
 * there, so the pager's scroll view never gets that touch, and the stack's
 * back gesture does. A pan that starts anywhere else turns the page.
 *
 * LegendList lays each item of a sideways list in a box as tall as the
 * item's own content, so a page given only `flex: 1` grows to its words'
 * full height and its scroll view has nothing to scroll. Each page is
 * therefore given the pager's measured height (`onLayout`).
 *
 * The pager's scroll view is LegendList's own (`Animated.ScrollView`), drawn
 * inside the gesture handler's native gesture (`renderScrollComponent`), so
 * a page's held seek can block it (`SeekScrollsProvider`, `WordSeek.native.tsx`).
 * A pushed screen is a native view of its own, outside the home screen's
 * gesture root, so the screen is its own `GestureHandlerRootView`: a
 * detector outside one throws as it draws in a development build, and the
 * gesture handler does not recognize its gestures.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { LegendList } from '@legendapp/list/react-native';
import { Option } from 'effect';
import { useParams, useRouter } from 'one';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useNativeGesture,
} from 'react-native-gesture-handler';

import { hymnAt, type HymnText, hymns } from '~/hymns/hymns';
import { readMeaningSoon } from '~/hymns/meaning';
import { PageBar } from '~/player/PlayerBar';

import { HymnPage, NoHymn } from './HymnPage';
import { backEdge, onPage, pageSource, settledAt } from './pager';
import { pagesFrom } from './place';
import { reader, Shown } from './screen';
import { seekHeld, SeekScrollsProvider, ShownPagesProvider, shownPagesOf } from './word-seek';

export { hymnParams } from './screen';

/** Every hymn's number, in order: the pages of a hymn opened from no list. */
const everyHymn = hymns.map((hymn) => hymn.number);

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => <NoHymn number={asked} />,
    onSome: (hymn) => <Pager shown={hymn} />,
  });
}

/** The pages around `shown`, the route's hymn, and the bar told of it alone. */
function Pager({ shown }: { readonly shown: HymnText }) {
  const from = useAtomValue(pagesFrom);
  const [pages] = useState(() => pageSource(from, shown.number, everyHymn));
  const taken = useAtomSet(pagesFrom);
  useEffect(() => taken(Option.none()), [taken]);
  useEffect(() => readMeaningSoon(), []);
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(Option.none<number>());
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    setHeight((was) => (Option.exists(was, (h) => h === measured) && was) || Option.some(measured));
  };
  const extraData = useMemo(() => ({ width, height }), [width, height]);
  const held = useAtomValue(seekHeld);
  const [seen] = useState(() => shownPagesOf(shown.number));
  useEffect(() => seen.show(shown.number), [seen, shown.number]);
  const pagerGesture = useNativeGesture({
    testID: 'hymn-pager-native',
    disallowInterruption: true,
    shouldCancelWhenOutside: false,
  });
  const renderScroll = useCallback(
    (props: ScrollViewProps) => (
      <GestureDetector gesture={pagerGesture}>
        <Animated.ScrollView {...props} />
      </GestureDetector>
    ),
    [pagerGesture],
  );
  const router = useRouter();
  const settle = (offset: number) =>
    Option.match(
      Option.filter(settledAt(offset, width, pages.list), (n) => n !== shown.number),
      {
        onNone: () => {},
        onSome: (n) => router.setParams({ number: String(n) }),
      },
    );
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(event.nativeEvent.contentOffset.x);
  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Option.match(
      Option.liftPredicate(event.nativeEvent.contentOffset.x, (x) => onPage(x, width)),
      { onNone: () => {}, onSome: settle },
    );
  return (
    <GestureHandlerRootView style={styles.screen}>
      <Shown hymn={shown} />
      <View style={styles.pages} onLayout={onLayout}>
        <ShownPagesProvider value={seen}>
          <SeekScrollsProvider value={[pagerGesture]}>
            <LegendList
              renderScrollComponent={renderScroll}
              data={pages.list}
              keyExtractor={String}
              horizontal
              pagingEnabled
              scrollEnabled={!held}
              showsHorizontalScrollIndicator={false}
              getFixedItemSize={() => width}
              estimatedItemSize={width}
              initialScrollIndex={pages.index}
              recycleItems={false}
              drawDistance={width}
              extraData={extraData}
              onMomentumScrollEnd={onMomentumScrollEnd}
              onScrollEndDrag={onScrollEndDrag}
              renderItem={drawPage}
              style={styles.pager}
            />
          </SeekScrollsProvider>
        </ShownPagesProvider>
        <View testID="back-edge" style={styles.backEdge} />
      </View>
      <PageBar track={shown} />
    </GestureHandlerRootView>
  );
}

/** One hymn's page, a screen wide. */
const drawPage = ({
  item,
  extraData,
}: {
  readonly item: number;
  readonly extraData: { readonly width: number; readonly height: Option.Option<number> };
}) => <PagerPage number={item} width={extraData.width} height={extraData.height} />;

/**
 * Hymn `number`'s page in the pager: drawn again only when its hymn or the
 * pager's size changes. Which page is seen, for a held seek, the page reads
 * from the pager's `ShownPages` without being drawn again.
 */
const PagerPage = memo(function PagerPage({
  number,
  width,
  height,
}: {
  readonly number: number;
  readonly width: number;
  readonly height: Option.Option<number>;
}) {
  return (
    <View
      testID="pager-page"
      style={[
        styles.page,
        { width },
        Option.match(height, { onNone: () => ({}), onSome: (tall) => ({ height: tall }) }),
      ]}
    >
      {Option.match(hymnAt(String(number)), {
        onNone: () => <NoHymn number={String(number)} />,
        onSome: (hymn) => <HymnPage hymn={hymn} reader={reader} />,
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pages: { flex: 1 },
  pager: { flex: 1 },
  backEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: backEdge },
  page: { flex: 1 },
});

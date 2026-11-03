import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { LegendList } from '@legendapp/list/react-native';
import { Option } from 'effect';
import { useParams, useRouter } from 'one';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { hymnAt, type HymnText, hymns } from '~/hymns/hymns';
import { readMeaningSoon } from '~/hymns/meaning';
import { PageBar } from '~/player/PlayerBar';

import { HymnPage, NoHymn } from './HymnPage';
import { backEdge, onPage, pageSource, settledAt } from './pager';
import { pagesFrom } from './place';
import { reader, Shown } from './screen';

export { hymnParams } from './screen';

const everyHymn = hymns.map((hymn) => hymn.number);

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => <NoHymn number={asked} />,
    onSome: (hymn) => <Pager shown={hymn} />,
  });
}

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
    <View style={styles.screen}>
      <Shown hymn={shown} />
      <View style={styles.pages} onLayout={onLayout}>
        <LegendList
          data={pages.list}
          keyExtractor={String}
          horizontal
          pagingEnabled
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
        <View testID="back-edge" style={styles.backEdge} />
      </View>
      <PageBar track={shown} />
    </View>
  );
}

const drawPage = ({
  item,
  extraData,
}: {
  readonly item: number;
  readonly extraData: { readonly width: number; readonly height: Option.Option<number> };
}) => <PagerPage number={item} width={extraData.width} height={extraData.height} />;

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

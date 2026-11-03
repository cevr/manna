import { useAtom } from '@effect/atom-react';
import type { Href } from 'one';
import { type ReactNode, useDeferredValue } from 'react';
import { StyleSheet, View } from 'react-native';

import { hymnIndex, search } from '~/hymns/search';
import { HymnList } from '~/reader/HymnList';
import { searchOffset, searchQuery } from '~/reader/place';
import { SearchField } from '~/web/SearchField';

export const searchLabel = 'Number, title or first line';

export function Results({
  hrefOf,
  idle,
}: {
  readonly hrefOf: (number: number) => Href;
  readonly idle?: ReactNode;
}) {
  const [query, setQuery] = useAtom(searchQuery);
  const shown = useDeferredValue(query);
  return (
    <View style={styles.screen}>
      <SearchField label={searchLabel} value={query} onChangeText={setQuery} />
      {(shown === '' && idle) || (
        <HymnList
          hymns={search(hymnIndex(), shown)}
          hrefOf={hrefOf}
          offset={searchOffset}
          empty={`No hymn matches “${shown}”.`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, minHeight: 0 } });

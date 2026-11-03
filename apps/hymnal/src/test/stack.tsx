import { params, Stack } from './one';

import { stackHeaders } from '~/reader/screen';
import { stackOptions } from '~/stack';

export function StackHeader() {
  return (
    <Stack.Screen
      options={stackOptions(
        'accent',
        stackHeaders,
      )({
        route: { name: 'hymns/[number]', params: { ...params } },
      })}
    />
  );
}

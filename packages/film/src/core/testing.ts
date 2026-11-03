import { Option, Result } from 'effect';
import * as HttpApi from 'effect/http-api/HttpApi';
import type * as HttpApiGroup from 'effect/http-api/HttpApiGroup';
import {
  type Library,
  type Lock,
  type MeasuredSounds,
  type Sounds,
  isDerived,
  measurePcm,
  renderSource,
  seedSources,
  soundEntry,
  sourceLabel,
} from './sfx.ts';
import { resolveCode } from './synth/resolve.ts';

export interface Route {
  readonly method: string;
  readonly path: string;
}

export const routesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<Route> => {
  const routes: Array<Route> = [];
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) =>
      void routes.push({ method: endpoint.method, path: endpoint.path }),
  });
  return routes;
};

const matcherOf = (path: string): RegExp =>
  new RegExp(`^${path.replace(/:\w+/g, '[^/]+').replace(/\*$/, '.*')}$`);

export const declares = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ((method: string, pathname: string) => boolean) => {
  const routes = routesOf(api).map((route) => ({
    method: route.method,
    path: matcherOf(route.path),
  }));
  return (method, pathname) =>
    routes.some((route) => route.method === method && route.path.test(pathname));
};

export const measuredSounds = (library: Library, lock: Lock, dir: string): MeasuredSounds => {
  const { code, trials } = Result.getOrThrow(resolveCode(library));
  const bare: Sounds = { library, lock, dir, code, trials };
  const sources = Object.keys(library).flatMap((name) =>
    Option.match(Option.filter(soundEntry(library, name), isDerived), {
      onNone: () => [],
      onSome: (entry) => seedSources(bare, name, entry),
    }),
  );
  return {
    ...bare,
    measured: new Map(
      sources.map((source) => [sourceLabel(source), measurePcm(renderSource(source))]),
    ),
  };
};

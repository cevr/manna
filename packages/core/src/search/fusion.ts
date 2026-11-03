import { Option } from 'effect';

export const RRF_K = 60;

export const ORIGINAL_QUERY_WEIGHT = 2;

export const TOP_RANK_BONUS = 0.05;
export const NEAR_TOP_RANK_BONUS = 0.02;

export interface FusionList {
  readonly ids: readonly string[];
  readonly weight: number;
}

interface FusedHit {
  readonly id: string;
  readonly score: number;
  readonly ranks: readonly Option.Option<number>[];
}

export const rankBonus = (bestRank: number): number => {
  if (bestRank === 1) return TOP_RANK_BONUS;
  if (bestRank <= 3) return NEAR_TOP_RANK_BONUS;
  return 0;
};

export const contribution = (rank: number, weight: number): number => weight / (RRF_K + rank);

export const fuse = (lists: readonly FusionList[]): readonly FusedHit[] => {
  const scores = new Map<string, number>();
  const ranks = new Map<string, Option.Option<number>[]>();
  const order = new Map<string, number>();
  const bestRank = new Map<string, number>();
  let seen = 0;

  lists.forEach((list, listIndex) => {
    list.ids.forEach((id, index) => {
      const rank = index + 1;
      const placed = Option.getOrElse(Option.fromNullishOr(ranks.get(id)), () => {
        const fresh = lists.map(() => Option.none<number>());
        ranks.set(id, fresh);
        order.set(id, seen);
        seen += 1;
        return fresh;
      });
      if (Option.isSome(placed[listIndex] ?? Option.none())) return;
      placed[listIndex] = Option.some(rank);
      scores.set(id, (scores.get(id) ?? 0) + contribution(rank, list.weight));
      bestRank.set(id, Math.min(bestRank.get(id) ?? rank, rank));
    });
  });

  return [...scores.entries()]
    .map(([id, score]) => ({
      id,
      score: score + rankBonus(bestRank.get(id) ?? Number.MAX_SAFE_INTEGER),
      ranks: ranks.get(id) ?? [],
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
    });
};

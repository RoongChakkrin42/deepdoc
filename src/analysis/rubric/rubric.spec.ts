import {
  AWARD_TIERS,
  awardTierFor,
  LEVEL_IDS_DESCENDING,
  levelById,
  levelForScore,
  MAX_TOTAL_SCORE,
  RUBRIC,
  RUBRIC_CRITERIA,
  RUBRIC_LEVELS,
} from './rubric';

describe('rubric', () => {
  it('weights sum to the maximum total score', () => {
    expect(RUBRIC.reduce((sum, d) => sum + d.weight, 0)).toBe(MAX_TOTAL_SCORE);
    expect(MAX_TOTAL_SCORE).toBe(100);
  });

  it('numbers dimensions consecutively from 1', () => {
    expect(RUBRIC.map((d) => d.index)).toEqual(
      RUBRIC.map((_, position) => position + 1),
    );
  });

  it('gives every criterion a unique code prefixed with its dimension', () => {
    const codes = RUBRIC_CRITERIA.map((criterion) => criterion.code);
    expect(new Set(codes).size).toBe(codes.length);

    RUBRIC.forEach((dimension) => {
      dimension.criteria.forEach((criterion) => {
        expect(criterion.code.startsWith(`${dimension.index}.`)).toBe(true);
      });
    });
  });

  it('states a requirement and at least one check for every criterion', () => {
    RUBRIC_CRITERIA.forEach((criterion) => {
      expect(criterion.title.trim()).not.toBe('');
      expect(criterion.evidenceRequirement.trim()).not.toBe('');
      expect(criterion.checks.length).toBeGreaterThan(0);
      criterion.checks.forEach((check) => expect(check.trim()).not.toBe(''));
    });
  });

  it('describes all five levels for every dimension', () => {
    RUBRIC.forEach((dimension) => {
      LEVEL_IDS_DESCENDING.forEach((id) => {
        expect(dimension.levels[id].trim()).not.toBe('');
      });
    });
  });

  it('orders level ids best-first', () => {
    expect(LEVEL_IDS_DESCENDING).toEqual([
      'outstanding',
      'mature',
      'developing',
      'beginning',
      'inadequate',
    ]);
  });

  it('places every level score inside its published band', () => {
    RUBRIC_LEVELS.forEach((level) => {
      const [min, max] = level.band.split('-').map(Number);
      expect(level.score).toBeGreaterThanOrEqual(min);
      expect(level.score).toBeLessThanOrEqual(max);
      expect(level.minScore).toBe(min);
    });
  });

  it('resolves a level by id and rejects an unknown one', () => {
    expect(levelById('mature')?.score).toBe(80);
    expect(levelById('excellent')).toBeUndefined();
  });

  it.each([
    [100, 'outstanding'],
    [90, 'outstanding'],
    [89.99, 'mature'],
    [70, 'mature'],
    [69.99, 'developing'],
    [50, 'developing'],
    [49.99, 'beginning'],
    [30, 'beginning'],
    [29.99, 'inadequate'],
    [0, 'inadequate'],
  ])('maps a score of %s to the %s band', (score, expected) => {
    expect(levelForScore(score).id).toBe(expected);
  });

  /**
   * Levels score at their band midpoint, so a submission judged outstanding on
   * all fifteen criteria totals 95 rather than 100 — which is what the official
   * "โดดเด่น = 90-100" band means. This test pins the consequence down: uniform
   * grading at any level must land inside that level's own band, and therefore
   * in the award tier the rubric intends.
   */
  it.each(RUBRIC_LEVELS.map((level) => [level.id, level.score] as const))(
    'totals %s across every criterion to %s',
    (_id, score) => {
      const total = RUBRIC.reduce(
        (sum, dimension) => sum + (score * dimension.weight) / 100,
        0,
      );
      expect(total).toBeCloseTo(score, 6);
    },
  );

  it('orders award tiers best-first and floors the last one at zero', () => {
    const floors = AWARD_TIERS.map((tier) => tier.minScore);
    expect(floors).toEqual([...floors].sort((a, b) => b - a));
    expect(floors[floors.length - 1]).toBe(0);
  });

  it.each([
    [100, 'excellence'],
    [85, 'excellence'],
    [84.99, 'recognition'],
    [70, 'recognition'],
    [69.99, 'improvement'],
    [50, 'improvement'],
    [49.99, 'participation'],
    [0, 'participation'],
  ])('awards %s the %s tier', (score, expected) => {
    expect(awardTierFor(score).id).toBe(expected);
  });
});

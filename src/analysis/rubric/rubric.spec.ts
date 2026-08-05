import {
  EVIDENCE_FIELDS,
  MAX_TOTAL_SCORE,
  RUBRIC,
  RUBRIC_CRITERIA,
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

  it('derives a unique upload field for every criterion', () => {
    expect(new Set(EVIDENCE_FIELDS).size).toBe(EVIDENCE_FIELDS.length);
    expect(EVIDENCE_FIELDS).toHaveLength(RUBRIC_CRITERIA.length);
  });

  it('prefixes every criterion code with its dimension index', () => {
    RUBRIC.forEach((dimension) => {
      dimension.criteria.forEach((criterion) => {
        expect(criterion.code.startsWith(`${dimension.index}.`)).toBe(true);
        expect(criterion.field).toBe(
          `evidence_${criterion.code.replace('.', '_')}`,
        );
      });
    });
  });

  it('states an evidence requirement for every criterion', () => {
    RUBRIC_CRITERIA.forEach((criterion) => {
      expect(criterion.title.trim()).not.toBe('');
      expect(criterion.evidenceRequirement.trim()).not.toBe('');
    });
  });
});

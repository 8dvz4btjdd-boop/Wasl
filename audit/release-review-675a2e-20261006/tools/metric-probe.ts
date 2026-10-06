import fs from 'node:fs';
import { isMajorEdit } from '/workspace/Wasl-audit-current-20261006/lib/cards/edits';
import { CARD_FIELDS, UNDEFINED_FIELD } from '/workspace/Wasl-audit-current-20261006/lib/cards/types';

// Synthetic field markers only; no dialogue, card content or external services.
const empty = Object.fromEntries(CARD_FIELDS.map((field) => [field, UNDEFINED_FIELD])) as Record<(typeof CARD_FIELDS)[number], string>;
const filled = Object.fromEntries(CARD_FIELDS.map((field) => [field, 'AUDIT_FIELD_POPULATED'])) as typeof empty;
const changed = { ...filled, covered: 'AUDIT_REPLACED_FIELD' };
const result = {
  baseSha: '675a2e0089ee1e4324a7b438c17d570989793bc1',
  mode: 'actual pure function execution; synthetic non-dialogue markers; not human grading',
  cases: [
    { id: 'undefined_to_fully_filled', actualIsMajorEdit: isMajorEdit(empty, filled), implication: 'Filling every undefined field is counted as not a major edit.' },
    { id: 'unchanged_fields', actualIsMajorEdit: isMajorEdit(filled, filled), expected: false },
    { id: 'generated_field_removed', actualIsMajorEdit: isMajorEdit(filled, empty), expected: true },
    { id: 'text_replacement', actualIsMajorEdit: isMajorEdit(filled, changed), expected: true },
  ],
  evidence: { path: 'lib/cards/edits.ts', lines: '23-30' },
  paidCalls: 0,
};
fs.writeFileSync('/workspace/wasl-release-audit-20261006/evidence/METRIC_PROBE.json', JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result) + '\n');

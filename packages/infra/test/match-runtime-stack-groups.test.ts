import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { resourcesOfType, synthMatchRuntimeStack, type SynthResult } from './support.js';

type Resource = { Properties?: Record<string, unknown> };

function statements(synth: SynthResult): Array<Record<string, unknown>> {
  return resourcesOfType(synth.template, 'AWS::IAM::Policy').flatMap(([, policy]) => {
    const document = policy.Properties?.PolicyDocument as { Statement?: Array<Record<string, unknown>> } | undefined;
    return document?.Statement ?? [];
  });
}

describe('MatchRuntimeStack table groups', () => {
  let synth: SynthResult;

  before(() => {
    synth = synthMatchRuntimeStack();
  });

  it('keeps the four anchor construct ids and tags each with a group', () => {
    const seeded = resourcesOfType(synth.template, 'Custom::SeededPokerTable');
    assert.equal(seeded.length, 4);
    const logicalIds = seeded.map(([id]) => id).sort();
    for (const prefix of ['SeededTable', 'SeededTableBigSlick', 'SeededTableButton', 'SeededTablePocketRockets']) {
      assert.ok(
        logicalIds.some((id) => id.startsWith(prefix)),
        prefix,
      );
    }
    const groupIds = seeded.map(([, resource]) => resource.Properties?.GroupId);
    assert.deepEqual(groupIds.sort(), ['big-slick', 'pocket-rockets', 'the-button', 'the-limp']);
  });

  it('lets the seed handler read and update the anchor row', () => {
    const seed = statements(synth).find((statement) => {
      const actions = [statement.Action].flat();
      return (
        actions.includes('dynamodb:PutItem') &&
        actions.includes('dynamodb:UpdateItem') &&
        actions.includes('dynamodb:GetItem') &&
        actions.length === 3
      );
    });
    assert.ok(seed, 'seed table policy');
  });

  it('sweeps overflow tables once an hour', () => {
    const rules = resourcesOfType(synth.template, 'AWS::Events::Rule');
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.[1].Properties?.ScheduleExpression, 'rate(1 hour)');

    const sweep = resourcesOfType(synth.template, 'AWS::Lambda::Function').find(([id]) =>
      id.startsWith('TableSweepHandler'),
    );
    assert.ok(sweep);
    const env = (sweep[1] as Resource).Properties?.Environment as { Variables?: Record<string, string> };
    assert.equal(env.Variables?.GROUP_IDS, 'the-limp,the-button,big-slick,pocket-rockets');
    assert.ok(env.Variables?.TABLE_NAME);
  });
});

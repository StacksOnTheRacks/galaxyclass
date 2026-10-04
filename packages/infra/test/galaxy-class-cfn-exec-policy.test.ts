import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const policy = JSON.parse(
  readFileSync(fileURLToPath(new URL('../iam/galaxy-class-www-cfn-exec.json', import.meta.url)), 'utf8'),
) as {
  Statement: Array<{ Sid?: string; Action?: string | string[]; Resource?: string | string[] }>;
};

test('CloudFormation execution policy can manage the Riffle table sweep schedule', () => {
  const statement = policy.Statement.find((entry) => entry.Sid === 'RiffleTableSweepSchedule');
  assert.ok(statement);
  const actions = statement.Action;
  assert.ok(Array.isArray(actions));
  for (const action of [
    'events:DescribeRule',
    'events:PutRule',
    'events:DeleteRule',
    'events:PutTargets',
    'events:RemoveTargets',
    'events:ListTargetsByRule',
  ]) {
    assert.ok(actions.includes(action), action);
  }
  assert.equal(statement.Resource, 'arn:aws:events:us-east-1:903395879533:rule/MatchRuntimeStack-*');
});

test('CloudFormation execution policy can create the profiles table', () => {
  const statement = policy.Statement.find((entry) => entry.Sid === 'ProfileDynamoDB');
  assert.ok(statement);
  assert.equal(statement.Action, 'dynamodb:*');
  assert.deepEqual(statement.Resource, [
    'arn:aws:dynamodb:us-east-1:903395879533:table/galaxyclass-profiles-prod',
    'arn:aws:dynamodb:us-east-1:903395879533:table/galaxyclass-profiles-prod/index/*',
  ]);
});

const scribblePolicy = JSON.parse(
  readFileSync(fileURLToPath(new URL('../iam/scribble-runtime-cfn-exec.json', import.meta.url)), 'utf8'),
) as typeof policy;

test('each execution policy fits the 6,144-character managed-policy limit', () => {
  for (const [name, doc] of [
    ['galaxy-class-www-cfn-exec', policy],
    ['scribble-runtime-cfn-exec', scribblePolicy],
  ] as const) {
    assert.ok(JSON.stringify(doc).length <= 6144, name);
  }
});

test('Scribble runtime execution policy is scoped to ScribbleRuntimeStack resources', () => {
  const resources = scribblePolicy.Statement.flatMap((entry) =>
    Array.isArray(entry.Resource) ? entry.Resource : [entry.Resource ?? ''],
  );
  assert.ok(resources.length > 0);
  for (const resource of resources) {
    assert.match(resource, /ScribbleRuntimeStack|scribbleruntimestack|apigateway:us-east-1::\/(apis|tags)/, resource);
    assert.notEqual(resource, '*');
  }
  const sids = scribblePolicy.Statement.map((entry) => entry.Sid);
  for (const sid of ['ScribbleStack', 'ScribbleLambda', 'ScribbleRoles', 'ScribbleDynamoDB', 'ScribbleBuckets', 'ScribbleWebSocketApi']) {
    assert.ok(sids.includes(sid), sid);
  }
  const layers = scribblePolicy.Statement.find((entry) => entry.Sid === 'ScribbleLambda');
  assert.ok((layers?.Resource as string[]).includes('arn:aws:lambda:us-east-1:903395879533:layer:ScribbleRuntimeStack*'));
});

test('the site stack can write the Scribble play-origin bucket policy, and nothing else on it', () => {
  const statement = scribblePolicy.Statement.find((entry) => entry.Sid === 'ScribblePlayOriginBucketPolicy');
  assert.ok(statement);
  assert.deepEqual(statement.Action, ['s3:GetBucketPolicy', 's3:PutBucketPolicy', 's3:DeleteBucketPolicy']);
  assert.equal(statement.Resource, 'arn:aws:s3:::scribbleruntimestack-scribbleplayoriginbucket*');
});

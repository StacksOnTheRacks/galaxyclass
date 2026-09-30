import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const policy = JSON.parse(
  readFileSync(fileURLToPath(new URL('../iam/galaxy-class-www-cfn-exec.json', import.meta.url)), 'utf8'),
) as {
  Statement: Array<{ Sid?: string; Action?: string | string[]; Resource?: string | string[] }>;
};

test('CloudFormation execution policy can create the profiles table', () => {
  const statement = policy.Statement.find((entry) => entry.Sid === 'ProfileDynamoDB');
  assert.ok(statement);
  assert.equal(statement.Action, 'dynamodb:*');
  assert.deepEqual(statement.Resource, [
    'arn:aws:dynamodb:us-east-1:903395879533:table/galaxyclass-profiles-prod',
    'arn:aws:dynamodb:us-east-1:903395879533:table/galaxyclass-profiles-prod/index/*',
  ]);
});

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { before, describe, it } from 'node:test';
import {
  findStagedFiles,
  resourcesOfType,
  stagedConfigForDeployment,
  synthMatchRuntimeStack,
  type SynthResult,
} from './support.js';

type Resource = { Properties?: Record<string, unknown> };

function runtimeHandler(synth: SynthResult): Resource {
  const handler = resourcesOfType(synth.template, 'AWS::Lambda::Function').find(([id]) =>
    id.startsWith('MatchRuntimeHandler'),
  );
  assert.ok(handler, 'match runtime handler');
  return handler[1];
}

function handlerEnv(synth: SynthResult): Record<string, unknown> {
  return (
    (runtimeHandler(synth).Properties?.Environment as { Variables?: Record<string, unknown> } | undefined)
      ?.Variables ?? {}
  );
}

function deploymentProps(synth: SynthResult, prefix: string | undefined): Record<string, unknown> {
  const deployment = resourcesOfType(synth.template, 'Custom::CDKBucketDeployment').find(
    ([, resource]) => resource.Properties?.DestinationBucketKeyPrefix === prefix,
  );
  assert.ok(deployment);
  return deployment[1].Properties!;
}

function profileStatements(synth: SynthResult): Array<Record<string, unknown>> {
  return resourcesOfType(synth.template, 'AWS::IAM::Policy').flatMap(([, policy]) =>
    ((policy.Properties?.PolicyDocument as { Statement?: Array<Record<string, unknown>> }).Statement ?? []).filter(
      (statement) => JSON.stringify(statement.Resource).includes('Profiles'),
    ),
  );
}

describe('MatchRuntimeStack player auth', () => {
  let withAuth: SynthResult;
  let guestOnly: SynthResult;

  before(() => {
    withAuth = synthMatchRuntimeStack({ withPlayerAuth: true });
    guestOnly = synthMatchRuntimeStack();
  });

  it('passes the player pool, app client, and profile table to the runtime', () => {
    const env = handlerEnv(withAuth);
    for (const name of ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID', 'PROFILE_TABLE_NAME']) {
      assert.ok(env[name], name);
      assert.match(JSON.stringify(env[name]), /Fn::ImportValue/, `${name} comes from GalaxyClassAuth-prod`);
    }
    assert.match(JSON.stringify(env.COGNITO_USER_POOL_ID), /Players/);
    assert.match(JSON.stringify(env.COGNITO_CLIENT_ID), /PlayersWeb/);
    assert.match(JSON.stringify(env.PROFILE_TABLE_NAME), /Profiles/);
  });

  it('grants only GetItem on the profile table', () => {
    const statements = profileStatements(withAuth);
    assert.equal(statements.length, 1);
    assert.deepEqual(statements[0]!.Action, 'dynamodb:GetItem');
    assert.equal(statements[0]!.Effect, 'Allow');
    assert.doesNotMatch(JSON.stringify(statements[0]!.Resource), /\/index\/|\*/);
  });

  it('shares the pool config with the /riffle origin only', () => {
    const configs = findStagedFiles(withAuth.outdir, 'config.json').map((file) => fs.readFileSync(file, 'utf8'));
    const withAuthBlock = configs.filter((raw) => /"auth":/.test(raw));
    assert.equal(withAuthBlock.length, 1);
    assert.match(withAuthBlock[0]!, /"auth":\{"userPoolId":<<marker:[^>]+>>,"userPoolClientId":<<marker:[^>]+>>\}/);

    const playMarkers = JSON.stringify(deploymentProps(withAuth, 'riffle').SourceMarkers);
    assert.match(playMarkers, /Players/);
    assert.match(playMarkers, /PlayersWeb/);
    assert.doesNotMatch(playMarkers, /Profiles/);
    assert.doesNotMatch(JSON.stringify(deploymentProps(withAuth, undefined).SourceMarkers), /Players/);
  });

  it('runs guest-only without player auth', () => {
    const env = handlerEnv(guestOnly);
    assert.equal(env.COGNITO_USER_POOL_ID, undefined);
    assert.equal(env.COGNITO_CLIENT_ID, undefined);
    assert.equal(env.PROFILE_TABLE_NAME, undefined);
    assert.equal(profileStatements(guestOnly).length, 0);
    const play = stagedConfigForDeployment(guestOnly.outdir, deploymentProps(guestOnly, 'riffle'));
    assert.doesNotMatch(play.raw, /"auth"/);
  });
});

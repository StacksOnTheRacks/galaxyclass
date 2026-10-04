import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { DASHBOARD_ARTIFACT_DIR, PLAY_ORIGIN_ARTIFACT_DIR } from '../lib/match-runtime-stack.js';
import { SEEDED_TABLES } from '../lib/seeded-table-listing.js';
import {
  listTextArtifacts,
  resourcesOfType,
  stagedConfigForDeployment,
  synthMatchRuntimeStack,
  type SynthResult,
} from './support.js';

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('MatchRuntimeStack seeded table', () => {
  let synth: SynthResult;
  let seedLogicalId: string;
  let matchTableId: string;

  before(() => {
    synth = synthMatchRuntimeStack();
    const seeds = resourcesOfType(synth.template, 'Custom::SeededPokerTable');
    assert.equal(seeds.length, SEEDED_TABLES.length);
    const limp = seeds.find(([, seed]) => seed.Properties?.SmallBlind === SEEDED_TABLES[0]!.smallBlind);
    assert.ok(limp, 'low-stakes seed exists');
    seedLogicalId = limp[0];
    matchTableId = Object.keys(synth.template.findResources('AWS::DynamoDB::Table'))[0]!;
  });

  it('seeds one custom resource per stakes level, bound to the match table', () => {
    const seeds = resourcesOfType(synth.template, 'Custom::SeededPokerTable');
    for (const spec of SEEDED_TABLES) {
      const match = seeds.find(
        ([, seed]) =>
          seed.Properties?.SmallBlind === spec.smallBlind &&
          seed.Properties?.BigBlind === spec.bigBlind &&
          seed.Properties?.DefaultStack === spec.defaultStack,
      );
      assert.ok(match, `seed for ${spec.name}`);
    }
    for (const [, seed] of seeds) {
      assert.deepEqual(seed.Properties?.TableName, { Ref: matchTableId });
      assert.ok(seed.Properties?.ServiceToken, 'backed by a provider');
      assert.deepEqual(Object.keys(seed.Properties ?? {}).sort(), [
        'BigBlind',
        'DefaultStack',
        'GroupId',
        'ServiceToken',
        'SmallBlind',
        'TableLabel',
        'TableName',
      ]);
      assert.equal(seed.Properties?.GroupId, SEEDED_TABLES.find((spec) => spec.smallBlind === seed.Properties?.SmallBlind)?.groupId);
    }
  });

  it('exports SeededTableId from the custom resource, not a hardcoded id', () => {
    const outputs = synth.template.findOutputs('SeededTableId');
    const value = outputs.SeededTableId?.Value;
    assert.deepEqual(value, { 'Fn::GetAtt': [seedLogicalId, 'TableId'] });
  });

  it('exports PlayUrl as https://galaxyclass.app/riffle/ plus the seeded table id', () => {
    const value = synth.template.findOutputs('PlayUrl').PlayUrl?.Value as {
      'Fn::Join': [string, unknown[]];
    };
    assert.deepEqual(value, {
      'Fn::Join': ['', ['https://galaxyclass.app/riffle/', { 'Fn::GetAtt': [seedLogicalId, 'TableId'] }]],
    });
    assert.doesNotMatch(JSON.stringify(value), UUID_LIKE);
  });

  it('grants the seed function put, get, and update on the match table ARN', () => {
    const seedFunctions = Object.entries(
      synth.template.findResources('AWS::Lambda::Function'),
    ).filter(([id]) => id.startsWith('SeedTableHandler'));
    assert.equal(seedFunctions.length, 1);
    const roleRef = (seedFunctions[0]![1].Properties.Role as { 'Fn::GetAtt': [string, string] })[
      'Fn::GetAtt'
    ][0];

    const policies = resourcesOfType(synth.template, 'AWS::IAM::Policy').filter(([, policy]) =>
      (policy.Properties?.Roles as Array<{ Ref: string }>).some((role) => role.Ref === roleRef),
    );
    assert.equal(policies.length, 1);

    const statements = (
      policies[0]![1].Properties?.PolicyDocument as { Statement: Array<Record<string, unknown>> }
    ).Statement;
    assert.deepEqual(statements, [
      {
        Action: ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:GetItem'],
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [matchTableId, 'Arn'] },
      },
    ]);
  });

  it('publishes stakes groups in config.json without embedding anchor table ids', () => {
    for (const dir of [DASHBOARD_ARTIFACT_DIR, PLAY_ORIGIN_ARTIFACT_DIR]) {
      for (const file of listTextArtifacts(dir)) {
        const body = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(body, /SeededTableId|PlayUrl/);
      }
    }

    const deployments = resourcesOfType(synth.template, 'Custom::CDKBucketDeployment');
    assert.equal(deployments.length, 2);
    for (const [, deployment] of deployments) {
      const props = deployment.Properties ?? {};
      const { raw } = stagedConfigForDeployment(synth.outdir, props);
      assert.match(
        raw,
        /"name":"The Limp".*"name":"The Button".*"name":"Big Slick".*"name":"Pocket Rockets"/,
      );
      assert.match(raw, /"blindsLabel":"\$1 \/ \$2".*"blindsLabel":"\$25 \/ \$50"/);
      assert.match(raw, /"id":"the-limp"/);
      assert.match(raw, /"maxSeats":8/);
      assert.doesNotMatch(raw, UUID_LIKE);
      assert.doesNotMatch(JSON.stringify(props.SourceMarkers), new RegExp(seedLogicalId));
    }
  });

  it('adds no public create path, Cognito, or custom domain', () => {
    synth.template.resourceCountIs('AWS::Cognito::UserPool', 0);
    synth.template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    synth.template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    synth.template.resourceCountIs('AWS::IAM::AccessKey', 0);
    const routes = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Route').map(
      ([, route]) => route.Properties?.RouteKey,
    );
    assert.deepEqual(routes.sort(), ['$connect', '$default', '$disconnect']);
  });
});

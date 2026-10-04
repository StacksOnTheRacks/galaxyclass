import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GalaxyClassAuthStack } from '../lib/galaxy-class-auth-stack.js';
import {
  SCRIBBLE_ARTIFACT_DIR,
  SCRIBBLE_DEPLOY_LAYER_NAME,
  SCRIBBLE_DICTIONARY_PATH,
  ScribbleRuntimeStack,
} from '../lib/scribble-runtime-stack.js';
import { SCRIBBLE_SEEDED_TABLES } from '../lib/scribble-seeded-tables.js';
import {
  CREDENTIAL_PATTERNS,
  listTextArtifacts,
  resourcesOfType,
  stagedConfigForDeployment,
  TEST_ACCOUNT,
  TEST_REGION,
} from './support.js';

function synthScribble(options?: { withPlayerAuth?: boolean }) {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const env = { account: TEST_ACCOUNT, region: TEST_REGION };
  const playerAuth = options?.withPlayerAuth
    ? new GalaxyClassAuthStack(app, 'GalaxyClassAuth-prod', { env }).playerAuth
    : undefined;
  const stack = new ScribbleRuntimeStack(app, 'ScribbleRuntimeStack', { env, playerAuth });
  return { app, stack, template: Template.fromStack(stack), outdir: app.outdir };
}

/** Deploy-time tokens stage as bare `<<marker:…>>` values; quote them so the JSON parses. */
function parseStagedConfig(raw: string): unknown {
  return JSON.parse(raw.replace(/<<marker:[^>]+>>/g, (marker) => JSON.stringify(marker)));
}

function playOriginDeployment(template: Template): Record<string, unknown> {
  const deployments = resourcesOfType(template, 'Custom::CDKBucketDeployment');
  assert.equal(deployments.length, 1);
  return deployments[0]![1].Properties!;
}

function runtimeHandler(template: Template): Record<string, unknown> {
  const functions = resourcesOfType(template, 'AWS::Lambda::Function').filter(([, fn]) => {
    const variables = (fn.Properties?.Environment as { Variables?: Record<string, unknown> } | undefined)?.Variables;
    return variables?.DICTIONARY_PATH !== undefined;
  });
  assert.equal(functions.length, 1, 'exactly one function loads the dictionary');
  return functions[0]![1].Properties!;
}

describe('ScribbleRuntimeStack', () => {
  let synth: ReturnType<typeof synthScribble>;
  let authed: ReturnType<typeof synthScribble>;

  before(() => {
    synth = synthScribble();
    authed = synthScribble({ withPlayerAuth: true });
  });

  it('owns a DynamoDB table with the byTable index, separate from Riffle', () => {
    synth.template.resourceCountIs('AWS::DynamoDB::Table', 1);
    synth.template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        {
          IndexName: 'byTable',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });
  });

  it('runs the runtime on Node 22 with the dictionary beside the bundle', () => {
    const handler = runtimeHandler(synth.template);
    assert.equal(handler.Runtime, 'nodejs22.x');
    assert.equal(handler.MemorySize, 1024);
    const variables = (handler.Environment as { Variables: Record<string, unknown> }).Variables;
    assert.equal(variables.DICTIONARY_PATH, SCRIBBLE_DICTIONARY_PATH);
    assert.ok(variables.TABLE_NAME);
    assert.equal(variables.COGNITO_USER_POOL_ID, undefined);
  });

  it('exposes a WebSocket API with only connect, disconnect and default routes on a prod stage', () => {
    synth.template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    synth.template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'WEBSOCKET' });
    synth.template.hasResourceProperties('AWS::ApiGatewayV2::Stage', { StageName: 'prod', AutoDeploy: true });
    const routes = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Route').map(
      ([, route]) => route.Properties?.RouteKey,
    );
    assert.deepEqual(routes.sort(), ['$connect', '$default', '$disconnect']);
    assert.match(JSON.stringify(synth.template.toJSON()), /execute-api:ManageConnections/);
  });

  it('seeds one public table per lobby entry and has no create-table path', () => {
    const seeds = resourcesOfType(synth.template, 'Custom::SeededScribbleTable');
    assert.equal(seeds.length, SCRIBBLE_SEEDED_TABLES.length);
    assert.deepEqual(
      seeds.map(([, seed]) => seed.Properties?.TableLabel).sort(),
      SCRIBBLE_SEEDED_TABLES.map((spec) => spec.name).sort(),
    );
    for (const spec of SCRIBBLE_SEEDED_TABLES) {
      assert.ok(
        Object.keys(synth.template.findResources('Custom::SeededScribbleTable')).some((id) =>
          id.startsWith(spec.constructId),
        ),
        `${spec.constructId} keeps a stable logical id`,
      );
    }
    synth.template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    synth.template.resourceCountIs('AWS::Cognito::UserPool', 0);
  });

  it('deploys the built client under /scribble with a config listing seeded tables', () => {
    const props = playOriginDeployment(synth.template);
    assert.equal(props.DestinationBucketKeyPrefix, 'scribble');
    const { raw } = stagedConfigForDeployment(synth.outdir, props);
    const config = parseStagedConfig(raw) as { webSocketUrl: string; tables: Array<{ id: string; name: string; blurb: string }> };
    assert.match(config.webSocketUrl, /<<marker:/);
    assert.deepEqual(
      config.tables.map((table) => table.name),
      SCRIBBLE_SEEDED_TABLES.map((spec) => spec.name),
    );
    for (const table of config.tables) {
      assert.match(table.id, /<<marker:/, 'table ids come from the seed custom resources');
      assert.ok(table.blurb.length > 0);
    }
    assert.equal((config as { auth?: unknown }).auth, undefined);
    assert.doesNotMatch(raw, /blind|stack|poker/i);
  });

  it('names the deploy CLI layer for the scoped execution role', () => {
    const layers = resourcesOfType(synth.template, 'AWS::Lambda::LayerVersion');
    assert.ok(layers.some(([, layer]) => layer.Properties?.LayerName === SCRIBBLE_DEPLOY_LAYER_NAME));
  });

  it('with player auth, reads profiles only and shares the studio user pool with the client', () => {
    const handler = runtimeHandler(authed.template);
    const variables = (handler.Environment as { Variables: Record<string, unknown> }).Variables;
    assert.ok(variables.COGNITO_USER_POOL_ID);
    assert.ok(variables.COGNITO_CLIENT_ID);
    assert.ok(variables.PROFILE_TABLE_NAME);

    const policies = JSON.stringify(authed.template.findResources('AWS::IAM::Policy'));
    assert.match(policies, /"dynamodb:GetItem"/);
    const profileStatements = Object.values(authed.template.findResources('AWS::IAM::Policy'))
      .flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties.PolicyDocument.Statement)
      .filter((statement) => JSON.stringify(statement).includes('ProfileTable'));
    for (const statement of profileStatements) {
      assert.equal((statement as { Action: unknown }).Action, 'dynamodb:GetItem');
    }

    const { raw } = stagedConfigForDeployment(authed.outdir, playOriginDeployment(authed.template));
    const config = parseStagedConfig(raw) as { auth?: { userPoolId: string; userPoolClientId: string } };
    assert.ok(config.auth?.userPoolId);
    assert.ok(config.auth?.userPoolClientId);
  });

  it('ships a client artifact with no credentials', () => {
    assert.ok(fs.existsSync(path.join(SCRIBBLE_ARTIFACT_DIR, 'index.html')));
    for (const file of listTextArtifacts(SCRIBBLE_ARTIFACT_DIR)) {
      const body = fs.readFileSync(file, 'utf8');
      for (const pattern of CREDENTIAL_PATTERNS) {
        assert.doesNotMatch(body, pattern, file);
      }
    }
  });
});

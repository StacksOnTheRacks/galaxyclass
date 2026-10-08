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
  WARSHIPS_ARTIFACT_DIR,
  WARSHIPS_DEPLOY_LAYER_NAME,
  WHODUNIT_ARTIFACT_DIR,
  WHODUNIT_DEPLOY_LAYER_NAME,
} from '../lib/scribble-runtime-stack.js';
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

function playOriginDeployment(template: Template, prefix = 'scribble'): Record<string, unknown> {
  const deployments = resourcesOfType(template, 'Custom::CDKBucketDeployment');
  assert.equal(deployments.length, 3, 'one deployment per game into the shared play-origin bucket');
  const matching = deployments.filter(([, deployment]) => deployment.Properties?.DestinationBucketKeyPrefix === prefix);
  assert.equal(matching.length, 1);
  return matching[0]![1].Properties!;
}

function warshipsHandler(template: Template): Record<string, unknown> {
  const functions = resourcesOfType(template, 'AWS::Lambda::Function').filter(([id]) =>
    id.startsWith('WarshipsRuntimeHandler'),
  );
  assert.equal(functions.length, 1);
  return functions[0]![1].Properties!;
}

function whodunitHandler(template: Template): Record<string, unknown> {
  const functions = resourcesOfType(template, 'AWS::Lambda::Function').filter(([id]) =>
    id.startsWith('WhodunitRuntimeHandler'),
  );
  assert.equal(functions.length, 1);
  return functions[0]![1].Properties!;
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

  it('exposes one WebSocket API per game, each with only connect, disconnect and default routes on a prod stage', () => {
    synth.template.resourceCountIs('AWS::ApiGatewayV2::Api', 3);
    const apis = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Api');
    for (const [, api] of apis) {
      assert.equal(api.Properties?.ProtocolType, 'WEBSOCKET');
    }
    const stages = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Stage');
    assert.equal(stages.length, 3);
    for (const [, stage] of stages) {
      assert.equal(stage.Properties?.StageName, 'prod');
      assert.equal(stage.Properties?.AutoDeploy, true);
    }
    const routes = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Route');
    for (const [apiId] of apis) {
      const keys = routes
        .filter(([, route]) => JSON.stringify(route.Properties?.ApiId) === JSON.stringify({ Ref: apiId }))
        .map(([, route]) => route.Properties?.RouteKey);
      assert.deepEqual(keys.sort(), ['$connect', '$default', '$disconnect'], apiId);
    }
    assert.match(JSON.stringify(synth.template.toJSON()), /execute-api:ManageConnections/);
  });

  it('seeds no tables: members create their own, so there is no public lobby to stock', () => {
    assert.deepEqual(Object.keys(synth.template.findResources('Custom::SeededScribbleTable')), []);
    assert.deepEqual(Object.keys(synth.template.findOutputs('SeededTableId')), []);
    assert.equal(
      resourcesOfType(synth.template, 'AWS::Lambda::Function').filter(([id]) => id.includes('Seed')).length,
      0,
    );
    synth.template.resourceCountIs('AWS::Cognito::UserPool', 0);
  });

  it('deploys the built client under /scribble with a config that lists no tables', () => {
    const props = playOriginDeployment(synth.template);
    assert.equal(props.DestinationBucketKeyPrefix, 'scribble');
    const { raw } = stagedConfigForDeployment(synth.outdir, props);
    const config = parseStagedConfig(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(config), ['webSocketUrl']);
    assert.match(config.webSocketUrl as string, /<<marker:/);
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

describe('Warships in ScribbleRuntimeStack', () => {
  let synth: ReturnType<typeof synthScribble>;
  let authed: ReturnType<typeof synthScribble>;

  before(() => {
    synth = synthScribble();
    authed = synthScribble({ withPlayerAuth: true });
  });

  it('runs a small Node 22 Lambda on the shared table, without the dictionary', () => {
    const handler = warshipsHandler(synth.template);
    assert.equal(handler.Runtime, 'nodejs22.x');
    assert.equal(handler.MemorySize, 256);
    assert.equal(handler.Timeout, 10);
    const variables = (handler.Environment as { Variables: Record<string, unknown> }).Variables;
    assert.deepEqual(Object.keys(variables), ['TABLE_NAME']);
    const [tableId] = Object.keys(synth.template.findResources('AWS::DynamoDB::Table'));
    assert.deepEqual(variables.TABLE_NAME, { Ref: tableId });
  });

  it('wires its own WebSocket API to the Warships Lambda only', () => {
    const integrations = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Integration');
    const warships = integrations.filter(([id]) => id.startsWith('WarshipsWebSocketApi'));
    assert.equal(warships.length, 3);
    for (const [, integration] of warships) {
      assert.match(JSON.stringify(integration.Properties?.IntegrationUri), /WarshipsRuntimeHandler/);
    }
    const policies = JSON.stringify(synth.template.findResources('AWS::IAM::Policy'));
    assert.match(policies, /WarshipsWebSocketApi/);
  });

  it('deploys the built client under /warships in the Scribble play-origin bucket', () => {
    const props = playOriginDeployment(synth.template, 'warships');
    const scribble = playOriginDeployment(synth.template, 'scribble');
    assert.deepEqual(props.DestinationBucketName, scribble.DestinationBucketName);
    const { raw } = stagedConfigForDeployment(synth.outdir, props);
    const config = parseStagedConfig(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(config), ['webSocketUrl']);
    assert.match(config.webSocketUrl as string, /<<marker:/);
    synth.template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  it('names its deploy CLI layer for the scoped execution role', () => {
    const layers = resourcesOfType(synth.template, 'AWS::Lambda::LayerVersion').map(
      ([, layer]) => layer.Properties?.LayerName,
    );
    assert.ok(layers.includes(WARSHIPS_DEPLOY_LAYER_NAME));
    for (const name of layers) {
      assert.match(String(name), /^ScribbleRuntimeStack/);
    }
  });

  it('outputs its socket and lobby URLs', () => {
    const outputs = synth.template.findOutputs('*');
    assert.ok(outputs.WarshipsWebSocketUrl);
    assert.equal(outputs.WarshipsLobbyUrl?.Value, 'https://galaxyclass.app/warships');
  });

  it('with player auth, reads profiles only and shares the studio user pool with the client', () => {
    const variables = (warshipsHandler(authed.template).Environment as { Variables: Record<string, unknown> }).Variables;
    assert.ok(variables.COGNITO_USER_POOL_ID);
    assert.ok(variables.COGNITO_CLIENT_ID);
    assert.ok(variables.PROFILE_TABLE_NAME);
    assert.equal(variables.DICTIONARY_PATH, undefined);

    const warshipsPolicies = Object.entries(authed.template.findResources('AWS::IAM::Policy')).filter(([id]) =>
      id.startsWith('WarshipsRuntimeHandler'),
    );
    assert.equal(warshipsPolicies.length, 1);
    const statements = (warshipsPolicies[0]![1] as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties
      .PolicyDocument.Statement;
    const profile = statements.filter((statement) => JSON.stringify(statement).includes('GalaxyClassAuth-prod'));
    assert.equal(profile.length, 1);
    assert.equal((profile[0] as { Action: unknown }).Action, 'dynamodb:GetItem');

    const { raw } = stagedConfigForDeployment(authed.outdir, playOriginDeployment(authed.template, 'warships'));
    const config = parseStagedConfig(raw) as { auth?: { userPoolId: string; userPoolClientId: string } };
    assert.ok(config.auth?.userPoolId);
    assert.ok(config.auth?.userPoolClientId);
  });

  it('ships a client artifact with no credentials', () => {
    assert.ok(fs.existsSync(path.join(WARSHIPS_ARTIFACT_DIR, 'index.html')));
    for (const file of listTextArtifacts(WARSHIPS_ARTIFACT_DIR)) {
      const body = fs.readFileSync(file, 'utf8');
      for (const pattern of CREDENTIAL_PATTERNS) {
        assert.doesNotMatch(body, pattern, file);
      }
    }
  });
});

describe('Whodunit in ScribbleRuntimeStack', () => {
  let synth: ReturnType<typeof synthScribble>;
  let authed: ReturnType<typeof synthScribble>;

  before(() => {
    synth = synthScribble();
    authed = synthScribble({ withPlayerAuth: true });
  });

  it('runs a small Node 22 Lambda on the shared table, without the dictionary', () => {
    const handler = whodunitHandler(synth.template);
    assert.equal(handler.Runtime, 'nodejs22.x');
    assert.equal(handler.MemorySize, 256);
    assert.equal(handler.Timeout, 10);
    const variables = (handler.Environment as { Variables: Record<string, unknown> }).Variables;
    assert.deepEqual(Object.keys(variables), ['TABLE_NAME']);
    const [tableId] = Object.keys(synth.template.findResources('AWS::DynamoDB::Table'));
    assert.deepEqual(variables.TABLE_NAME, { Ref: tableId });
  });

  it('wires its own WebSocket API to the Whodunit Lambda only', () => {
    const integrations = resourcesOfType(synth.template, 'AWS::ApiGatewayV2::Integration');
    const whodunit = integrations.filter(([id]) => id.startsWith('WhodunitWebSocketApi'));
    assert.equal(whodunit.length, 3);
    for (const [, integration] of whodunit) {
      assert.match(JSON.stringify(integration.Properties?.IntegrationUri), /WhodunitRuntimeHandler/);
    }
    const policies = JSON.stringify(synth.template.findResources('AWS::IAM::Policy'));
    assert.match(policies, /WhodunitWebSocketApi/);
  });

  it('deploys the built client under /whodunit in the Scribble play-origin bucket', () => {
    const props = playOriginDeployment(synth.template, 'whodunit');
    const scribble = playOriginDeployment(synth.template, 'scribble');
    assert.deepEqual(props.DestinationBucketName, scribble.DestinationBucketName);
    const { raw } = stagedConfigForDeployment(synth.outdir, props);
    const config = parseStagedConfig(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(config), ['webSocketUrl']);
    assert.match(config.webSocketUrl as string, /<<marker:/);
    synth.template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  it('names its deploy CLI layer for the scoped execution role', () => {
    const layers = resourcesOfType(synth.template, 'AWS::Lambda::LayerVersion').map(
      ([, layer]) => layer.Properties?.LayerName,
    );
    assert.ok(layers.includes(WHODUNIT_DEPLOY_LAYER_NAME));
    for (const name of layers) {
      assert.match(String(name), /^ScribbleRuntimeStack/);
    }
  });

  it('outputs its socket and lobby URLs', () => {
    const outputs = synth.template.findOutputs('*');
    assert.ok(outputs.WhodunitWebSocketUrl);
    assert.equal(outputs.WhodunitLobbyUrl?.Value, 'https://galaxyclass.app/whodunit');
  });

  it('with player auth, reads profiles only and shares the studio user pool with the client', () => {
    const variables = (whodunitHandler(authed.template).Environment as { Variables: Record<string, unknown> }).Variables;
    assert.ok(variables.COGNITO_USER_POOL_ID);
    assert.ok(variables.COGNITO_CLIENT_ID);
    assert.ok(variables.PROFILE_TABLE_NAME);
    assert.equal(variables.DICTIONARY_PATH, undefined);

    const whodunitPolicies = Object.entries(authed.template.findResources('AWS::IAM::Policy')).filter(([id]) =>
      id.startsWith('WhodunitRuntimeHandler'),
    );
    assert.equal(whodunitPolicies.length, 1);
    const statements = (whodunitPolicies[0]![1] as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties
      .PolicyDocument.Statement;
    const profile = statements.filter((statement) => JSON.stringify(statement).includes('GalaxyClassAuth-prod'));
    assert.equal(profile.length, 1);
    assert.equal((profile[0] as { Action: unknown }).Action, 'dynamodb:GetItem');

    const { raw } = stagedConfigForDeployment(authed.outdir, playOriginDeployment(authed.template, 'whodunit'));
    const config = parseStagedConfig(raw) as { auth?: { userPoolId: string; userPoolClientId: string } };
    assert.ok(config.auth?.userPoolId);
    assert.ok(config.auth?.userPoolClientId);
  });

  it('ships a client artifact with no credentials', () => {
    assert.ok(fs.existsSync(path.join(WHODUNIT_ARTIFACT_DIR, 'index.html')));
    for (const file of listTextArtifacts(WHODUNIT_ARTIFACT_DIR)) {
      const body = fs.readFileSync(file, 'utf8');
      for (const pattern of CREDENTIAL_PATTERNS) {
        assert.doesNotMatch(body, pattern, file);
      }
    }
  });
});

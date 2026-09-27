import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.github/workflows/deploy.yml',
);
const yaml = readFileSync(workflowPath, 'utf8');

function at(needle) {
  const index = yaml.indexOf(needle);
  assert.notEqual(index, -1, `missing ${needle}`);
  return index;
}

test('triggers only on push to main and workflow_dispatch', () => {
  assert.match(yaml, /push:\n\s+branches:\s*\[main\]/);
  assert.match(yaml, /^ {2}workflow_dispatch:\s*$/m);
  assert.equal(yaml.includes('pull_request'), false);
});

test('job uses production environment and only OIDC token permissions', () => {
  assert.match(yaml, /environment:\s*production/);
  const permissions = yaml.match(/permissions:\n((?:[ \t]+(?:id-token|contents):[^\n]*\n)+)/);
  assert.ok(permissions, 'permissions block');
  const lines = permissions[1]
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(lines.sort(), ['contents: read', 'id-token: write']);
});

test('fails closed when the deploy role ARN is empty, before assume-role', () => {
  const failClosed = at("vars.AWS_DEPLOY_ROLE_ARN == ''");
  const assume = at('aws-actions/configure-aws-credentials@v4');
  assert.ok(failClosed < assume);
  assert.match(yaml.slice(failClosed, assume), /exit 1/);
});

test('assumes the OIDC role with the production vars and no long-lived keys', () => {
  assert.match(yaml, /uses:\s*aws-actions\/configure-aws-credentials@v4/);
  assert.match(yaml, /role-to-assume:\s*\$\{\{\s*vars\.AWS_DEPLOY_ROLE_ARN\s*\}\}/);
  assert.match(yaml, /aws-region:\s*\$\{\{\s*vars\.AWS_REGION\s*\|\|\s*'us-east-1'\s*\}\}/);
  for (const forbidden of [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'aws-access-key-id',
    'aws-secret-access-key',
    'AKIA',
    'secrets.',
    'pull_request',
  ]) {
    assert.equal(yaml.includes(forbidden), false, forbidden);
  }
});

test('deploys auth then site with locked CDK flags and captured outputs', () => {
  const checkout = at('actions/checkout@v4');
  const node = at("node-version: '22'");
  const assume = at('aws-actions/configure-aws-credentials@v4');
  const cdkCi = at('working-directory: infra/cdk');
  const auth = at('npx cdk deploy GalaxyClassAuth-prod');
  const outputs = at('-O "$RUNNER_TEMP/galaxyclass-auth-outputs.json"');
  const build = at('npm ci && npm run build');
  const exportCheck = at('out/index.html');
  const site = at('npx cdk deploy GalaxyClassSite-prod');
  const apex = at('https://galaxyclass.app/');

  assert.deepEqual(
    [checkout, node, assume, cdkCi, auth, outputs, build, exportCheck, site, apex].sort((a, b) => a - b),
    [checkout, node, assume, cdkCi, auth, outputs, build, exportCheck, site, apex],
  );
  assert.match(yaml.slice(cdkCi, auth), /npm ci/);
  assert.equal(yaml.match(/actions\/setup-node@v4/g)?.length, 1);
  assert.equal(yaml.match(/--require-approval never/g)?.length, 2);
  assert.equal(yaml.match(/--toolkit-stack-name GalaxyClassToolkit/g)?.length, 2);
  assert.equal(yaml.match(/--context @aws-cdk\/core:bootstrapQualifier=galcls/g)?.length, 2);
  assert.equal(yaml.match(/-O "/g)?.length, 1);
});

test('maps the three public Cognito outputs and fails when any is empty', () => {
  const pool = at('NEXT_PUBLIC_COGNITO_USER_POOL_ID');
  const client = at('NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID');
  const region = at('NEXT_PUBLIC_COGNITO_REGION');
  const build = at('npm ci && npm run build');
  assert.ok(pool < build && client < build && region < build);
  assert.match(yaml.slice(Math.min(pool, client, region), build), /process\.exit\(1\)/);
  assert.match(yaml, /UserPoolId/);
  assert.match(yaml, /UserPoolClientId/);
  assert.match(yaml, /GalaxyClassAuth-prod/);
  assert.match(yaml, /GITHUB_ENV/);
});

test('builds on Node 22 and fails when out/index.html is missing before site deploy', () => {
  const node = at("node-version: '22'");
  const build = at('npm ci && npm run build');
  const exportCheck = at('out/index.html');
  const site = at('npx cdk deploy GalaxyClassSite-prod');
  assert.ok(node < build);
  assert.ok(build < exportCheck);
  assert.ok(exportCheck < site);
  assert.match(yaml.slice(exportCheck, site), /exit 1/);
});

test('retries the apex until HTTP 200 within 12 attempts 10 seconds apart', () => {
  const site = at('npx cdk deploy GalaxyClassSite-prod');
  const apex = at('name: Verify apex');
  const tail = yaml.slice(apex);
  assert.ok(site < apex);
  assert.match(tail, /https:\/\/galaxyclass\.app\//);
  assert.match(tail, /seq 1 12/);
  assert.match(tail, /sleep 10/);
  assert.match(tail, /"200"/);
  assert.match(tail, /exit 1/);
});

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { PLAY_ORIGIN_ARTIFACT_DIR, PLAY_ORIGIN_DEPLOY_LAYER_NAME } from '../lib/match-runtime-stack.js';
import {
  CREDENTIAL_PATTERNS,
  listTextArtifacts,
  resourcesOfType,
  stagedConfigForDeployment,
  stagedIndexHtml,
  synthMatchRuntimeStack,
  type SynthResult,
} from './support.js';

const FORBIDDEN_CLIENT_PATTERNS = [
  /aws-amplify/,
  /@aws-amplify/,
  /CognitoIdentityServiceProvider/,
  /amazon-cognito-identity/,
];

const repoRoot = path.resolve(PLAY_ORIGIN_ARTIFACT_DIR, '../..');

function statementsOf(policy: { Properties?: Record<string, unknown> }): Array<Record<string, unknown>> {
  return (
    (policy.Properties?.PolicyDocument as { Statement?: Array<Record<string, unknown>> } | undefined)
      ?.Statement ?? []
  );
}

function walkSource(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSource(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('MatchRuntimeStack play origin', () => {
  let synth: SynthResult;
  let playBucketId: string;
  let dashboardBucketId: string;
  let seedLogicalId: string;
  let playDeploymentProps: Record<string, unknown>;

  before(() => {
    synth = synthMatchRuntimeStack();
    const deployments = resourcesOfType(synth.template, 'Custom::CDKBucketDeployment');
    assert.equal(deployments.length, 2);
    const play = deployments.find(
      ([, resource]) => resource.Properties?.DestinationBucketKeyPrefix === 'riffle',
    );
    const root = deployments.find(
      ([, resource]) => resource.Properties?.DestinationBucketKeyPrefix === undefined,
    );
    assert.ok(play, 'play-origin BucketDeployment');
    assert.ok(root, 'dashboard root BucketDeployment');
    playDeploymentProps = play[1].Properties!;
    playBucketId = (playDeploymentProps.DestinationBucketName as { Ref: string }).Ref;
    dashboardBucketId = (root[1].Properties!.DestinationBucketName as { Ref: string }).Ref;
    seedLogicalId = resourcesOfType(synth.template, 'Custom::SeededPokerTable')[0]![0];
  });

  it('keeps one dashboard distribution and one origin access control', () => {
    synth.template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    synth.template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);

    const [, distribution] = resourcesOfType(synth.template, 'AWS::CloudFront::Distribution')[0]!;
    const origins = (
      distribution.Properties?.DistributionConfig as {
        Origins: Array<{ DomainName: { 'Fn::GetAtt': [string, string] } }>;
      }
    ).Origins;
    assert.equal(origins.length, 1);
    assert.equal(origins[0]!.DomainName['Fn::GetAtt'][0], dashboardBucketId);
    assert.notEqual(playBucketId, dashboardBucketId);
  });

  it('blocks public access on the play-origin bucket and does not host a website', () => {
    const buckets = resourcesOfType(synth.template, 'AWS::S3::Bucket');
    const play = buckets.find(([id]) => id === playBucketId);
    assert.ok(play);
    const props = play[1].Properties ?? {};
    assert.deepEqual(props.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    assert.equal(props.WebsiteConfiguration, undefined);
    assert.ok(props.BucketEncryption, 'play-origin bucket is encrypted');
    assert.ok(
      props.AccessControl === undefined || props.AccessControl === 'Private',
      'play-origin bucket must not use a public ACL',
    );
  });

  it('does not attach a bucket policy on the play origin (site stack owns it)', () => {
    const policies = resourcesOfType(synth.template, 'AWS::S3::BucketPolicy').filter(([, policy]) => {
      const buckets = ([] as string[]).concat(
        (policy.Properties?.Bucket as { Ref?: string } | undefined)?.Ref ?? [],
      );
      return buckets.includes(playBucketId) || JSON.stringify(policy.Properties?.Bucket).includes(playBucketId);
    });
    assert.equal(policies.length, 0);
  });

  it('publishes the /riffle artifact under the riffle/ prefix without a new distribution', () => {
    assert.equal(playDeploymentProps.DestinationBucketKeyPrefix, 'riffle');
    assert.equal(playDeploymentProps.DistributionId, undefined);
    assert.equal((playDeploymentProps.SourceObjectKeys as unknown[]).length, 2);

    const html = fs.readFileSync(stagedIndexHtml(synth.outdir, true), 'utf8');
    assert.match(html, /href="\/riffle\/assets\/fonts\/inter-latin-wght\.woff2"/);
    assert.match(html, /href="\/riffle\/dashboard-play\.css"/);
    assert.match(html, /src="\/riffle\/dashboard-play\.js"/);
    assert.doesNotMatch(html, /(?:href|src)="\/(?:dashboard-play|assets\/)/);

    const assetDir = path.dirname(stagedIndexHtml(synth.outdir, true));
    for (const name of ['dashboard-play.js', 'dashboard-play.css', 'assets/fonts/inter-latin-wght.woff2']) {
      assert.ok(fs.existsSync(path.join(assetDir, name)), `staged play artifact includes ${name}`);
    }

    const css = fs.readFileSync(path.join(assetDir, 'dashboard-play.css'), 'utf8');
    assert.match(css, /url\(\/riffle\/assets\//);
    assert.doesNotMatch(css, /url\((['"]?)\/assets\//);
  });

  it('serves both Riffle artifacts with no-cache so browsers and CloudFront revalidate after a deploy', () => {
    const deployments = resourcesOfType(synth.template, 'Custom::CDKBucketDeployment');
    for (const [, deployment] of deployments) {
      assert.deepEqual(deployment.Properties?.SystemMetadata, { 'cache-control': 'no-cache' });
    }
  });

  it('stages riffle/config.json with webSocketUrl and the seeded table listing', () => {
    const { raw, marker } = stagedConfigForDeployment(synth.outdir, playDeploymentProps);
    assert.match(
      raw,
      /^\{"webSocketUrl":(<<marker:[^>]+>>),"groups":\[\{"id":"the-limp","name":"The Limp"/,
      `riffle config.json includes webSocketUrl and seeded table listing: ${raw}`,
    );
    assert.match(raw, /"maxSeats":8\}\]\}$/);

    const markers = playDeploymentProps.SourceMarkers as Array<Record<string, unknown>>;
    const webSocketMarker = markers.find((entry) => marker in entry);
    assert.ok(webSocketMarker);
    const serialized = JSON.stringify({ raw, markers });
    for (const pattern of CREDENTIAL_PATTERNS) {
      assert.doesNotMatch(serialized, pattern);
    }
    assert.doesNotMatch(serialized, /riffle\.seat|hole/i);
    assert.doesNotMatch(serialized, new RegExp(seedLogicalId));
    assert.match(raw, /"id":"the-button"/);
    assert.match(raw, /"id":"pocket-rockets"/);
  });

  it('names the play-origin deploy layer for the cfn exec role', () => {
    const layers = resourcesOfType(synth.template, 'AWS::Lambda::LayerVersion');
    const play = layers.find(([id]) => id.startsWith('PlayOriginDeployment'));
    assert.ok(play);
    assert.equal(play[1].Properties?.LayerName, PLAY_ORIGIN_DEPLOY_LAYER_NAME);
    assert.match(PLAY_ORIGIN_DEPLOY_LAYER_NAME, /^MatchRuntimeStack/);
  });

  it('exports PlayOriginBucketName without an SSM parameter', () => {
    assert.equal(resourcesOfType(synth.template, 'AWS::SSM::Parameter').length, 0);
    assert.deepEqual(synth.template.findOutputs('PlayOriginBucketName').PlayOriginBucketName?.Value, {
      Ref: playBucketId,
    });
    assert.doesNotMatch(
      JSON.stringify(synth.template.findOutputs('PlayOriginBucketName').PlayOriginBucketName?.Value),
      new RegExp(seedLogicalId),
    );
  });

  it('exports PlayUrl on galaxyclass.app/riffle and leaves DashboardUrl on the distribution', () => {
    const playUrl = synth.template.findOutputs('PlayUrl').PlayUrl?.Value;
    assert.deepEqual(playUrl, {
      'Fn::Join': ['', ['https://galaxyclass.app/riffle/', { 'Fn::GetAtt': [seedLogicalId, 'TableId'] }]],
    });

    const [distributionId] = Object.keys(
      synth.template.findResources('AWS::CloudFront::Distribution'),
    );
    assert.deepEqual(synth.template.findOutputs('DashboardUrl').DashboardUrl?.Value, {
      'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [distributionId, 'DomainName'] }]],
    });
  });

  it('does not add a GitHub OIDC role or ssm:PutParameter deploy policy', () => {
    synth.template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    for (const [, role] of resourcesOfType(synth.template, 'AWS::IAM::Role')) {
      assert.doesNotMatch(
        JSON.stringify(role.Properties?.AssumeRolePolicyDocument),
        /token\.actions\.githubusercontent\.com/,
      );
    }
    for (const [, policy] of resourcesOfType(synth.template, 'AWS::IAM::Policy')) {
      const doc = JSON.stringify(policy.Properties?.PolicyDocument);
      assert.doesNotMatch(doc, /ssm:PutParameter/);
      assert.doesNotMatch(doc, /token\.actions\.githubusercontent\.com/);
    }
  });

  it('ships a /riffle bundle and sources with no credential material and Amplify only behind player-token', () => {
    const bundle = fs.readFileSync(path.join(PLAY_ORIGIN_ARTIFACT_DIR, 'dashboard-play.js'), 'utf8');
    const css = fs.readFileSync(path.join(PLAY_ORIGIN_ARTIFACT_DIR, 'dashboard-play.css'), 'utf8');
    const sources = [
      path.join(repoRoot, 'src/client/dashboard-play.ts'),
      ...walkSource(path.join(repoRoot, 'src/client/dashboard')),
      ...walkSource(path.join(repoRoot, 'src/client/dashboard-play')),
    ];
    const playerTokenSource = path.join(repoRoot, 'src/client/dashboard-play/player-token.ts');
    assert.ok(sources.includes(playerTokenSource));
    const scanned = [
      bundle,
      css,
      ...sources
        .filter((file) => file !== playerTokenSource)
        .map((file) => fs.readFileSync(file, 'utf8')),
    ];
    for (const body of scanned) {
      for (const pattern of FORBIDDEN_CLIENT_PATTERNS) {
        assert.doesNotMatch(body, pattern);
      }
    }
    assert.match(bundle, /\/riffle/);

    // Signed-in players get a Cognito access token from the studio's Amplify session, and nothing else:
    // no ID token, no raw storage access, no client-side decoding, no other Cognito APIs.
    const playerToken = fs.readFileSync(playerTokenSource, 'utf8');
    const imports = [...playerToken.matchAll(/import\(\s*'([^']+)'\s*\)|from '([^']+)'/g)].map(
      (match) => match[1] ?? match[2],
    );
    assert.deepEqual(new Set(imports.filter((spec) => spec?.includes('amplify'))), new Set(['aws-amplify', 'aws-amplify/auth']));
    assert.doesNotMatch(playerToken, /^import .*amplify/m, 'Amplify must be lazily imported');
    assert.match(playerToken, /fetchAuthSession\(\)/);
    assert.match(playerToken, /accessToken/);
    assert.doesNotMatch(playerToken, /idToken|localStorage|sessionStorage|atob|decodeJWT|signIn|signOut|CognitoIdentityServiceProvider/);
    assert.match(bundle, /import\("\.\/chunks\/[^"]+\.js"\)/);
    assert.doesNotMatch(bundle, /^import .* from "\.\/chunks\//m, 'Amplify chunks must not load for guests');

    // localStorage is allowed only for the studio's public-profile account hint, read once.
    const accountHintSource = path.join(repoRoot, 'src/client/dashboard-play/studio-account.ts');
    for (const file of sources.filter((file) => file !== accountHintSource)) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /localStorage/, file);
    }
    const hintReader = fs.readFileSync(accountHintSource, 'utf8');
    assert.match(hintReader, /from '@galaxyclass\/accounts\/account-hint'/);
    assert.doesNotMatch(hintReader, /setItem|removeItem|\.key\(|\.length\b/);
    const hintContract = fs.readFileSync(
      path.join(repoRoot, '../accounts/src/account-hint.ts'),
      'utf8',
    );
    assert.match(hintContract, /ACCOUNT_HINT_KEY = 'galaxyclass\.account'/);
    assert.doesNotMatch(hintContract, /email:/);
    assert.equal(bundle.match(/localStorage/g)?.length ?? 0, 1);
    assert.match(bundle, /galaxyclass\.account/);

    const stackSource = fs.readFileSync(
      path.join(repoRoot, '../infra/lib/match-runtime-stack.ts'),
      'utf8',
    );
    const artifactText = listTextArtifacts(PLAY_ORIGIN_ARTIFACT_DIR).map((file) =>
      fs.readFileSync(file, 'utf8'),
    );
    for (const body of [stackSource, ...artifactText]) {
      for (const pattern of CREDENTIAL_PATTERNS) {
        assert.doesNotMatch(body, pattern);
      }
    }
  });
});

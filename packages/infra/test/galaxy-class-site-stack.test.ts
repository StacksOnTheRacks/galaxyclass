import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { canonicalRedirectFunctionCode } from '../lib/cloudfront-canonical-redirect.js';
import { GalaxyClassAuthStack } from '../lib/galaxy-class-auth-stack.js';
import {
  GalaxyClassSiteStack,
  PROFILE_API_PATH,
  RIFFLE_CSP,
  SCRIBBLE_CSP,
  STUDIO_CSP,
  STUDIO_DEPLOY_LAYER_NAME,
} from '../lib/galaxy-class-site-stack.js';
import { MatchRuntimeStack } from '../lib/match-runtime-stack.js';
import { ScribbleRuntimeStack } from '../lib/scribble-runtime-stack.js';
import { TEST_ACCOUNT, TEST_REGION } from './support.js';

const EXPECTED_STUDIO_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com; frame-src 'none'; upgrade-insecure-requests";
const EXPECTED_RIFFLE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss://*.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; frame-src 'none'; upgrade-insecure-requests";

function synthSite(options?: { withRiffle?: boolean; withProfileApi?: boolean; withScribble?: boolean }) {
  const app = new App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  let scribblePlayOriginBucketName: string | undefined;
  if (options?.withScribble) {
    const scribble = new ScribbleRuntimeStack(app, 'ScribbleRuntimeStack', {
      env: { account: TEST_ACCOUNT, region: TEST_REGION },
    });
    scribblePlayOriginBucketName = scribble.playOriginBucket.bucketName;
  }
  let rifflePlayOriginBucketName: string | undefined;
  if (options?.withRiffle !== false) {
    const match = new MatchRuntimeStack(app, 'MatchRuntimeStack', {
      env: { account: TEST_ACCOUNT, region: TEST_REGION },
    });
    rifflePlayOriginBucketName = match.playOriginBucket.bucketName;
  }
  let profileApiDomainName: string | undefined;
  if (options?.withProfileApi !== false) {
    const auth = new GalaxyClassAuthStack(app, 'GalaxyClassAuth-prod', {
      env: { account: TEST_ACCOUNT, region: TEST_REGION },
    });
    profileApiDomainName = auth.profileApiDomainName;
  }
  const stack = new GalaxyClassSiteStack(app, 'GalaxyClassSite-prod', {
    env: { account: TEST_ACCOUNT, region: TEST_REGION },
    studioAssetPath: path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/site-out'),
    rifflePlayOriginBucketName,
    scribblePlayOriginBucketName,
    profileApiDomainName,
  });
  return { stack, template: Template.fromStack(stack) };
}

type Resource = { Type: string; Properties?: Record<string, unknown>; DeletionPolicy?: string; UpdateReplacePolicy?: string };

test('synthesizes GalaxyClassSite-prod in us-east-1', () => {
  const { stack, template } = synthSite();
  assert.equal(stack.stackName, 'GalaxyClassSite-prod');
  assert.equal(stack.region, TEST_REGION);
  assert.equal(stack.account, TEST_ACCOUNT);
  template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});

test('ACM certificate covers apex and www', () => {
  const { template } = synthSite();
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'galaxyclass.app',
    SubjectAlternativeNames: ['www.galaxyclass.app'],
    ValidationMethod: 'DNS',
  });
});

test('Route53 alias A records for apex and www use the hosted zone', () => {
  const { template } = synthSite();
  const records = Object.values(template.findResources('AWS::Route53::RecordSet')) as Resource[];
  const aliases = records.filter((record) => {
    const props = record.Properties ?? {};
    return props.Type === 'A' && props.AliasTarget != null;
  });
  assert.equal(aliases.length, 2);
  const names = aliases.map((record) => String(record.Properties?.Name)).sort();
  assert.deepEqual(names, ['galaxyclass.app.', 'www.galaxyclass.app.']);
  for (const record of aliases) {
    const target = record.Properties?.AliasTarget as { HostedZoneId?: string };
    const zoneId = record.Properties?.HostedZoneId;
    assert.equal(zoneId, 'Z02927871LCJW2KMZGKOP');
    assert.ok(target.HostedZoneId);
  }
});

test('studio origin is a private S3 bucket with OAC and no website endpoint', () => {
  const { template } = synthSite();
  const buckets = template.findResources('AWS::S3::Bucket');
  const ids = Object.keys(buckets);
  assert.equal(ids.length, 1);
  const bucket = buckets[ids[0]] as Resource;
  assert.equal(bucket.Properties?.WebsiteConfiguration, undefined);
  assert.deepEqual(bucket.Properties?.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  });
  assert.equal(bucket.DeletionPolicy, 'Retain');
  assert.equal(bucket.UpdateReplacePolicy, 'Retain');

  const policies = Object.values(template.findResources('AWS::S3::BucketPolicy')) as Resource[];
  const studioPolicy = policies.find((policy) => JSON.stringify(policy).includes('aws:SecureTransport'));
  assert.ok(studioPolicy);
  const doc = JSON.stringify(studioPolicy);
  assert.match(doc, /s3:GetObject/);
  assert.match(doc, /cloudfront\.amazonaws\.com/);
  assert.match(doc, /AWS:SourceArn/);
  assert.doesNotMatch(doc, /s3:GetObject\*.*Principal":"\*"/);
});

test('distribution redirects HTTP to HTTPS and maps studio 403 and 404 to index.html', () => {
  const { template } = synthSite();
  const distribution = distributionConfig(template);
  assert.equal(distribution.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https');
  for (const behavior of distribution.CacheBehaviors as Array<{ ViewerProtocolPolicy: string }>) {
    assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
  }
  const errors = distribution.CustomErrorResponses as Array<Record<string, unknown>>;
  assert.deepEqual(
    errors.map((error) => ({
      code: error.ErrorCode,
      response: error.ResponseCode,
      page: error.ResponsePagePath,
      ttl: error.ErrorCachingMinTTL,
    })),
    [
      { code: 403, response: 200, page: '/index.html', ttl: 0 },
      { code: 404, response: 200, page: '/index.html', ttl: 0 },
    ],
  );
  assert.equal(distribution.DefaultRootObject, 'index.html');
  assert.equal(distribution.PriceClass, 'PriceClass_100');
  assert.equal(distribution.Logging, undefined);
});

test('HSTS and separate studio and riffle CSPs', () => {
  assert.equal(STUDIO_CSP, EXPECTED_STUDIO_CSP);
  assert.equal(RIFFLE_CSP, EXPECTED_RIFFLE_CSP);
  const { template } = synthSite();
  const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy') as Record<string, Resource>;
  const policyList = Object.values(policies);
  assert.equal(policyList.length, 2);
  const csps = policyList.map((policy) => headerConfig(policy).ContentSecurityPolicy.ContentSecurityPolicy);
  assert.ok(csps.includes(EXPECTED_STUDIO_CSP));
  assert.ok(csps.includes(EXPECTED_RIFFLE_CSP));
  const riffle = csps.find((csp) => csp.includes('wss://*.execute-api.us-east-1.amazonaws.com'));
  assert.ok(riffle);
  // Riffle may refresh the studio's user-pool session, but never exchange it for AWS credentials.
  assert.deepEqual(riffle.match(/[\w.*-]*cognito[\w.*-]*/gi), ['cognito-idp.us-east-1.amazonaws.com']);
  for (const policy of policyList) {
    const hsts = headerConfig(policy).StrictTransportSecurity;
    assert.equal(hsts.AccessControlMaxAgeSec, 31536000);
    assert.equal(hsts.IncludeSubdomains, true);
    assert.notEqual(hsts.Preload, true);
  }

  const distribution = distributionConfig(template);
  const studioCspId = policyIdForCsp(policies, EXPECTED_STUDIO_CSP);
  const riffleCspId = policyIdForCsp(policies, EXPECTED_RIFFLE_CSP);
  assert.equal(refId(distribution.DefaultCacheBehavior.ResponseHeadersPolicyId), studioCspId);
  const behaviors = distribution.CacheBehaviors as Array<{ PathPattern: string; ResponseHeadersPolicyId: unknown }>;
  for (const behavior of behaviors) {
    const expected = behavior.PathPattern.startsWith('/riffle') ? riffleCspId : studioCspId;
    assert.equal(refId(behavior.ResponseHeadersPolicyId), expected, behavior.PathPattern);
  }
});

test('riffle behaviors use the cross-stack play origin without stripping the prefix', () => {
  const { template } = synthSite();
  const distribution = distributionConfig(template);
  const behaviors = distribution.CacheBehaviors as Array<{ PathPattern: string }>;
  assert.deepEqual(
    behaviors.map((behavior) => behavior.PathPattern).sort(),
    [PROFILE_API_PATH, '/riffle', '/riffle/*'],
  );
  const origins = distribution.Origins as Array<{
    DomainName: unknown;
    OriginPath?: string;
    OriginAccessControlId?: unknown;
    S3OriginConfig?: { OriginAccessIdentity?: string };
  }>;
  const s3Origins = origins.filter((origin) => origin.S3OriginConfig);
  assert.equal(origins.length, 3);
  assert.equal(s3Origins.length, 2);
  for (const origin of s3Origins) {
    assert.ok(origin.OriginAccessControlId);
    assert.equal(origin.OriginPath, undefined);
    assert.equal(origin.S3OriginConfig?.OriginAccessIdentity, '');
  }
  const buckets = template.findResources('AWS::S3::Bucket');
  assert.equal(Object.keys(buckets).length, 1);
});

test('riffle bucket policy allows GetObject for this distribution and denies insecure transport', () => {
  const { template } = synthSite();
  const policies = Object.values(template.findResources('AWS::S3::BucketPolicy')) as Resource[];
  const riffle = policies.find((policy) =>
    JSON.stringify(policy.Properties?.Bucket).includes('ImportValue'),
  );
  assert.ok(riffle, 'expected a cross-stack bucket policy for the riffle play origin');
  const doc = JSON.stringify(riffle);
  assert.match(doc, /s3:GetObject/);
  assert.match(doc, /cloudfront\.amazonaws\.com/);
  assert.match(doc, /AWS:SourceArn/);
  assert.match(doc, /distribution\//);
  assert.match(doc, /aws:SecureTransport/);
  assert.doesNotMatch(doc, /s3:PutObject|s3:DeleteObject/);
});

test('studio BucketDeployment invalidates the distribution and does not publish riffle', () => {
  const { template } = synthSite();
  const deployments = Object.values(template.findResources('Custom::CDKBucketDeployment')) as Resource[];
  assert.equal(deployments.length, 1);
  const paths = deployments[0].Properties?.DistributionPaths;
  assert.deepEqual(paths, ['/*']);
  assert.equal(deployments[0].Properties?.DistributionId != null, true);
  const rendered = JSON.stringify(deployments[0]);
  assert.doesNotMatch(rendered, /PlayOriginBucket/);
});

test('viewer-request function is associated before origin on every behavior', () => {
  const { template } = synthSite();
  const functions = template.findResources('AWS::CloudFront::Function');
  const functionIds = Object.keys(functions);
  assert.equal(functionIds.length, 1);
  const code = String((functions[functionIds[0]] as Resource).Properties?.FunctionCode);
  assert.equal(code, canonicalRedirectFunctionCode);
  assert.match(code, /www\.galaxyclass\.app/);
  assert.match(code, /\['\/riffle', '\/scribble', '\/warships', '\/whodunit'\]/);
  assert.match(code, /'\/index\.html'/);

  const distribution = distributionConfig(template);
  assertFunction(distribution.DefaultCacheBehavior);
  for (const behavior of distribution.CacheBehaviors as Array<Record<string, unknown>>) {
    if (behavior.PathPattern !== PROFILE_API_PATH) {
      assertFunction(behavior);
    }
  }
});

test('profile API is proxied same-origin at /api/* without caching or URI rewrites', () => {
  const { template } = synthSite();
  const distribution = distributionConfig(template);
  const api = (distribution.CacheBehaviors as Array<Record<string, any>>).find(
    (behavior) => behavior.PathPattern === PROFILE_API_PATH,
  );
  assert.ok(api, 'expected an /api/* behavior');
  assert.equal(api.FunctionAssociations, undefined);
  assert.deepEqual([...api.AllowedMethods].sort(), ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
  // Managed CachingDisabled and AllViewerExceptHostHeader (forwards Authorization to API Gateway).
  assert.equal(api.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
  assert.equal(api.OriginRequestPolicyId, 'b689b0a8-53d0-40ab-baf2-68738e2966ac');

  const origin = (distribution.Origins as Array<Record<string, any>>).find(
    (entry) => entry.Id === api.TargetOriginId,
  );
  assert.ok(origin);
  assert.equal(origin.CustomOriginConfig.OriginProtocolPolicy, 'https-only');
  assert.match(JSON.stringify(origin.DomainName), /ImportValue/);
  assert.equal(origin.S3OriginConfig, undefined);
});

test('outputs are exactly the public site identifiers', () => {
  const { template } = synthSite();
  const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
  assert.deepEqual(Object.keys(outputs).sort(), [
    'BucketName',
    'CertificateArn',
    'DistributionDomainName',
    'DistributionId',
    'SiteUrl',
  ]);
  assert.equal(outputs.SiteUrl.Value, 'https://galaxyclass.app');
});

test('studio asset deploy layer name matches the cfn exec role prefix', () => {
  const { template } = synthSite();
  const layers = Object.values(template.findResources('AWS::Lambda::LayerVersion')) as Resource[];
  assert.equal(layers.length, 1);
  assert.equal(layers[0].Properties?.LayerName, STUDIO_DEPLOY_LAYER_NAME);
});

test('without riffle bucket does not block studio synthesis', () => {
  const { template } = synthSite({ withRiffle: false, withProfileApi: false });
  const distribution = distributionConfig(template);
  assert.equal(distribution.CacheBehaviors, undefined);
  assert.equal((distribution.Origins as unknown[]).length, 1);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});

test('template resources do not embed secrets or an access-log bucket', () => {
  const { template } = synthSite();
  const json = template.toJSON();
  const scan = JSON.stringify({
    Resources: json.Resources,
    Outputs: json.Outputs,
    Parameters: json.Parameters,
  });
  assert.doesNotMatch(scan, /password|secret|api[_-]?key|private[_-]?key/i);
  assert.equal(Object.keys(template.findResources('AWS::S3::Bucket')).length, 1);
  const distribution = distributionConfig(template);
  assert.equal(distribution.Logging, undefined);
});

test('scribble is served from its own play origin at /scribble with its own CSP', () => {
  const { template } = synthSite({ withScribble: true });
  const distribution = distributionConfig(template);
  const behaviors = distribution.CacheBehaviors as Array<Record<string, any>>;
  assert.deepEqual(
    behaviors.map((behavior) => behavior.PathPattern).sort(),
    [
      PROFILE_API_PATH,
      '/riffle',
      '/riffle/*',
      '/scribble',
      '/scribble/*',
      '/warships',
      '/warships/*',
      '/whodunit',
      '/whodunit/*',
    ],
  );
  // Warships and Whodunit deploy under their own prefixes in the Scribble play-origin bucket and share its CSP.
  const scribble = behaviors.filter((behavior) => /^\/(scribble|warships|whodunit)/.test(String(behavior.PathPattern)));
  assert.equal(scribble.length, 6);
  assert.equal(new Set(scribble.map((behavior) => behavior.TargetOriginId)).size, 1);
  const riffle = behaviors.find((behavior) => behavior.PathPattern === '/riffle')!;
  assert.equal(scribble[0]!.TargetOriginId, scribble[1]!.TargetOriginId);
  assert.notEqual(scribble[0]!.TargetOriginId, riffle.TargetOriginId);
  for (const behavior of scribble) {
    assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
    assertFunction(behavior);
  }

  const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy') as Record<string, Resource>;
  assert.equal(Object.keys(policies).length, 3);
  const scribbleCspId = Object.keys(policies).find((id) => id.startsWith('ScribbleHeaders'));
  assert.ok(scribbleCspId);
  assert.equal(
    headerConfig(policies[scribbleCspId]!).ContentSecurityPolicy.ContentSecurityPolicy,
    SCRIBBLE_CSP,
  );
  assert.match(SCRIBBLE_CSP, /connect-src 'self' wss:\/\/\*\.execute-api\.us-east-1\.amazonaws\.com https:\/\/cognito-idp/);
  assert.match(SCRIBBLE_CSP, /img-src 'self' data: blob:/);
  assert.match(SCRIBBLE_CSP, /frame-ancestors 'none'/);
  assert.doesNotMatch(SCRIBBLE_CSP, /unsafe-eval|cognito-identity/);
  for (const behavior of scribble) {
    assert.equal(refId(behavior.ResponseHeadersPolicyId), scribbleCspId);
  }

  const origins = distribution.Origins as Array<{ OriginPath?: string; S3OriginConfig?: unknown; OriginAccessControlId?: unknown }>;
  const s3Origins = origins.filter((origin) => origin.S3OriginConfig);
  assert.equal(s3Origins.length, 3);
  for (const origin of s3Origins) {
    assert.ok(origin.OriginAccessControlId);
    assert.equal(origin.OriginPath, undefined);
  }

  const bucketPolicies = template.findResources('AWS::S3::BucketPolicy');
  const scribblePolicyId = Object.keys(bucketPolicies).find((id) => id.startsWith('ScribbleOriginReadPolicy'));
  assert.ok(scribblePolicyId, 'expected a cross-stack bucket policy for the scribble play origin');
  const doc = JSON.stringify(bucketPolicies[scribblePolicyId]);
  assert.match(doc, /ScribbleRuntimeStack/);
  assert.match(doc, /s3:GetObject/);
  assert.match(doc, /AWS:SourceArn/);
  assert.match(doc, /aws:SecureTransport/);
  assert.doesNotMatch(doc, /s3:PutObject|s3:DeleteObject/);
});

function distributionConfig(template: Template): Record<string, any> {
  const distributions = template.findResources('AWS::CloudFront::Distribution');
  const id = Object.keys(distributions)[0];
  return (distributions[id] as Resource).Properties?.DistributionConfig as Record<string, any>;
}

function headerConfig(policy: Resource): Record<string, any> {
  const config = policy.Properties?.ResponseHeadersPolicyConfig as {
    SecurityHeadersConfig: Record<string, any>;
  };
  return config.SecurityHeadersConfig;
}

function policyIdForCsp(policies: Record<string, Resource>, csp: string): string {
  const match = Object.entries(policies).find(
    ([, policy]) => headerConfig(policy).ContentSecurityPolicy.ContentSecurityPolicy === csp,
  );
  assert.ok(match);
  return match[0];
}

function refId(value: unknown): string {
  if (value && typeof value === 'object' && 'Ref' in value) {
    return String((value as { Ref: string }).Ref);
  }
  return JSON.stringify(value);
}

function assertFunction(behavior: Record<string, unknown>) {
  const associations = behavior.FunctionAssociations as Array<{ EventType: string }>;
  assert.equal(associations.length, 1);
  assert.equal(associations[0].EventType, 'viewer-request');
}

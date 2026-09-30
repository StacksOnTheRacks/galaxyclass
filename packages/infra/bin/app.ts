#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { GalaxyClassAuthStack } from '../lib/galaxy-class-auth-stack.js';
import { GalaxyClassSiteStack } from '../lib/galaxy-class-site-stack.js';
import { MatchRuntimeStack } from '../lib/match-runtime-stack.js';

const app = new App();
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const studioOut = path.join(monorepoRoot, 'packages/www/out');
const studioFixture = path.join(monorepoRoot, 'packages/infra/test/fixtures/site-out');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const authStack = new GalaxyClassAuthStack(app, 'GalaxyClassAuth-prod', {
  env: {
    account: env.account,
    region: 'us-east-1',
  },
});

const matchStack = new MatchRuntimeStack(app, 'MatchRuntimeStack', {
  env,
  playerAuth: authStack.playerAuth,
});

new GalaxyClassSiteStack(app, 'GalaxyClassSite-prod', {
  env: {
    account: env.account,
    region: 'us-east-1',
  },
  studioAssetPath: existsSync(studioOut) ? studioOut : studioFixture,
  rifflePlayOriginBucketName: matchStack.playOriginBucket.bucketName,
  profileApiDomainName: authStack.profileApiDomainName,
});

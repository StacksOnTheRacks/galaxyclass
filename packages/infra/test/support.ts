import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GalaxyClassAuthStack } from '../lib/galaxy-class-auth-stack.js';
import { MatchRuntimeStack } from '../lib/match-runtime-stack.js';

export const TEST_ACCOUNT = '111111111111';
export const TEST_REGION = 'us-east-1';

export function synthAuthStack(): { stack: GalaxyClassAuthStack; template: Template } {
  const app = new App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  const stack = new GalaxyClassAuthStack(app, 'GalaxyClassAuth-prod', {
    env: { account: TEST_ACCOUNT, region: TEST_REGION },
  });
  return { stack, template: Template.fromStack(stack) };
}

export interface SynthResult {
  app: App;
  stack: MatchRuntimeStack;
  template: Template;
  outdir: string;
}

export function synthMatchRuntimeStack(): SynthResult {
  const app = new App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  const stack = new MatchRuntimeStack(app, 'MatchRuntimeStack', {
    env: { account: TEST_ACCOUNT, region: TEST_REGION },
  });
  const template = Template.fromStack(stack);
  return { app, stack, template, outdir: app.outdir };
}

export function resourcesOfType(
  template: Template,
  type: string,
): Array<[string, { Properties?: Record<string, unknown> }]> {
  return Object.entries(template.findResources(type)) as Array<
    [string, { Properties?: Record<string, unknown> }]
  >;
}

export function findStagedFiles(outdir: string, fileName: string): string[] {
  const matches: string[] = [];
  if (!fs.existsSync(outdir)) {
    return matches;
  }
  for (const entry of fs.readdirSync(outdir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('asset.')) {
      continue;
    }
    const candidate = path.join(outdir, entry.name, fileName);
    if (fs.existsSync(candidate)) {
      matches.push(candidate);
    }
  }
  return matches;
}

export function findStagedFile(outdir: string, fileName: string): string | null {
  return findStagedFiles(outdir, fileName)[0] ?? null;
}

export function stagedIndexHtml(outdir: string, riffle: boolean): string {
  const matches = findStagedFiles(outdir, 'index.html').filter((file) => {
    const body = fs.readFileSync(file, 'utf8');
    return body.includes('/riffle/') === riffle;
  });
  if (matches.length !== 1) {
    throw new Error(`expected one ${riffle ? '/riffle' : 'root'} index.html, found ${matches.length}`);
  }
  return matches[0]!;
}

export function stagedConfigForDeployment(
  outdir: string,
  deploymentProps: Record<string, unknown>,
): { raw: string; marker: string } {
  const markers = deploymentProps.SourceMarkers as Array<Record<string, unknown>> | undefined;
  for (const configPath of findStagedFiles(outdir, 'config.json')) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const markerMatch = raw.match(/<<marker:[^>]+>>/);
    if (!markerMatch) {
      continue;
    }
    const marker = markerMatch[0];
    if (markers?.some((entry) => Object.prototype.hasOwnProperty.call(entry, marker))) {
      return { raw, marker };
    }
  }
  throw new Error('no staged config.json belongs to this deployment');
}

const TEXT_ARTIFACT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);

/** Text files (recursively) in a built artifact dir; binary images/fonts are skipped. */
export function listTextArtifacts(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTextArtifacts(full));
    } else if (entry.isFile() && TEXT_ARTIFACT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export const CREDENTIAL_PATTERNS = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /aws_secret_access_key/i,
  /AWS_SECRET_ACCESS_KEY/,
];

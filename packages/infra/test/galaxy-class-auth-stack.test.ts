import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_ACCOUNT, TEST_REGION, synthAuthStack } from './support.js';

/** Always-on compute; on-demand Lambda for profiles is counted separately. */
const COMPUTE_TYPES = [
  'AWS::EC2::Instance',
  'AWS::ECS::Service',
  'AWS::ECS::TaskDefinition',
  'AWS::RDS::DBInstance',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancing::LoadBalancer',
  'AWS::AutoScaling::AutoScalingGroup',
] as const;

test('cdk app synthesizes GalaxyClassAuth-prod in us-east-1 without AWS credentials', () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CDK_DEFAULT_ACCOUNT: TEST_ACCOUNT,
    CDK_DEFAULT_REGION: TEST_REGION,
  };
  delete env.AWS_PROFILE;
  delete env.AWS_ACCESS_KEY_ID;
  delete env.AWS_SECRET_ACCESS_KEY;
  delete env.AWS_SESSION_TOKEN;
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('npx', ['cdk', 'synth', 'GalaxyClassAuth-prod', '--quiet'], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const template = readFileSync(path.join(cwd, 'cdk.out', 'GalaxyClassAuth-prod.template.json'), 'utf8');
  assert.match(template, /"UserPoolName": "galaxyclass-players-prod"/);
  assert.match(template, /"EmailSendingAccount": "DEVELOPER"/);
  assert.match(template, new RegExp(`ses:${TEST_REGION}:${TEST_ACCOUNT}:identity/galaxyclass.app`));
});

test('synthesizes GalaxyClassAuth-prod in us-east-1', () => {
  const { stack, template } = synthAuthStack();
  assert.equal(stack.stackName, 'GalaxyClassAuth-prod');
  assert.equal(stack.region, TEST_REGION);
  const resources = template.toJSON().Resources as Record<string, { Type: string }>;
  assert.ok(Object.values(resources).some((resource) => resource.Type === 'AWS::Cognito::UserPool'));
});

test('user pool is email sign-up with verification, password policy, and retain', () => {
  const { template } = synthAuthStack();
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'galaxyclass-players-prod',
    UsernameAttributes: ['email'],
    AutoVerifiedAttributes: ['email'],
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    MfaConfiguration: 'OFF',
    DeletionProtection: 'ACTIVE',
    UserPoolTier: 'ESSENTIALS',
    Policies: {
      PasswordPolicy: {
        MinimumLength: 8,
        RequireUppercase: true,
        RequireLowercase: true,
        RequireNumbers: true,
        RequireSymbols: false,
      },
    },
    AccountRecoverySetting: {
      RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
    },
    EmailConfiguration: {
      EmailSendingAccount: 'DEVELOPER',
      From: 'noreply@galaxyclass.app',
      SourceArn: {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            `:ses:${TEST_REGION}:${TEST_ACCOUNT}:identity/galaxyclass.app`,
          ],
        ],
      },
    },
  });

  template.hasResource('AWS::Cognito::UserPool', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  });

  const pool = Object.values(
    template.findResources('AWS::Cognito::UserPool'),
  )[0] as { Properties: Record<string, unknown> };
  assert.equal(pool.Properties.SmsConfiguration, undefined);
  const email = pool.Properties.EmailConfiguration as { EmailSendingAccount?: string };
  assert.equal(email.EmailSendingAccount, 'DEVELOPER');
  assert.notEqual(email.EmailSendingAccount, 'COGNITO_DEFAULT');
  const recovery = pool.Properties.AccountRecoverySetting as {
    RecoveryMechanisms: Array<{ Name: string }>;
  };
  assert.deepEqual(
    recovery.RecoveryMechanisms.map((mechanism) => mechanism.Name),
    ['verified_email'],
  );

  const schema = (pool.Properties.Schema ?? []) as Array<{ Name?: string; Required?: boolean }>;
  for (const attribute of schema) {
    assert.notEqual(attribute.Required, true, `${attribute.Name ?? 'attribute'} must not be required`);
  }
  assert.equal(
    schema.some((attribute) => attribute.Name === 'phone_number' && attribute.Required === true),
    false,
  );
});

test('app client is public SRP plus refresh only, with no OAuth or Hosted UI', () => {
  const { template } = synthAuthStack();
  const clients = template.findResources('AWS::Cognito::UserPoolClient');
  const client = Object.values(clients)[0] as { Properties: Record<string, unknown> };
  assert.equal(Object.keys(clients).length, 1);
  assert.equal(client.Properties.GenerateSecret, false);
  assert.equal(client.Properties.PreventUserExistenceErrors, 'ENABLED');

  const flows = [...(client.Properties.ExplicitAuthFlows as string[])].sort();
  assert.deepEqual(flows, ['ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH']);
  for (const forbidden of ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_CUSTOM_AUTH']) {
    assert.equal(flows.includes(forbidden), false);
  }

  assert.equal(client.Properties.AllowedOAuthFlowsUserPoolClient, false);
  assert.equal(client.Properties.AllowedOAuthFlows, undefined);
  assert.equal(client.Properties.AllowedOAuthScopes, undefined);
  assert.equal(client.Properties.CallbackURLs, undefined);
  assert.equal(client.Properties.LogoutURLs, undefined);
  assert.equal(client.Properties.DefaultRedirectURI, undefined);
  assert.deepEqual(client.Properties.SupportedIdentityProviders, ['COGNITO']);

  template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);
  template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
});

test('outputs are only the public pool id, client id, and region', () => {
  const { template } = synthAuthStack();
  const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
  assert.deepEqual(Object.keys(outputs).sort(), ['Region', 'UserPoolClientId', 'UserPoolId']);
  assert.equal(outputs.Region.Value, TEST_REGION);
  assert.ok(outputs.UserPoolId.Value);
  assert.ok(outputs.UserPoolClientId.Value);
});

test('template has no social IdP, Hosted UI, phone MFA, or always-on compute', () => {
  const { template } = synthAuthStack();
  template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);
  template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
  for (const type of COMPUTE_TYPES) {
    template.resourceCountIs(type, 0);
  }
  template.resourceCountIs('AWS::Lambda::Function', 2);

  const resources = template.toJSON().Resources as Record<string, { Type: string }>;
  const types = new Set(Object.values(resources).map((resource) => resource.Type));
  const allowed = ['AWS::Cognito::', 'AWS::DynamoDB::Table', 'AWS::Lambda::', 'AWS::IAM::', 'AWS::ApiGatewayV2::'];
  for (const type of types) {
    assert.equal(
      allowed.some((prefix) => type.startsWith(prefix)) || type === 'AWS::CDK::Metadata',
      true,
      `unexpected resource type ${type}`,
    );
  }
});

test('profile table keeps player data and expires abandoned sign-up reservations', () => {
  const { template } = synthAuthStack();
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'galaxyclass-profiles-prod',
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    DeletionProtectionEnabled: true,
  });
  template.hasResource('AWS::DynamoDB::Table', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  });
});

test('sign-up and confirmation triggers reserve and claim gamer tags', () => {
  const { template } = synthAuthStack();
  const pool = Object.values(template.findResources('AWS::Cognito::UserPool'))[0] as {
    Properties: { LambdaConfig?: Record<string, unknown> };
  };
  const config = pool.Properties.LambdaConfig ?? {};
  assert.deepEqual(Object.keys(config).sort(), ['PostConfirmation', 'PreSignUp']);
  assert.deepEqual(config.PreSignUp, config.PostConfirmation);

  const permissions = Object.values(template.findResources('AWS::Lambda::Permission')) as Array<{
    Properties: Record<string, unknown>;
  }>;
  assert.ok(permissions.some((permission) => permission.Properties.Principal === 'cognito-idp.amazonaws.com'));
});

test('profile lambdas run node22 against the profile table with table-scoped access', () => {
  const { template } = synthAuthStack();
  const functions = Object.values(template.findResources('AWS::Lambda::Function')) as Array<{
    Properties: { Runtime: string; Environment: { Variables: Record<string, unknown> } };
  }>;
  for (const fn of functions) {
    assert.equal(fn.Properties.Runtime, 'nodejs22.x');
    assert.ok(fn.Properties.Environment.Variables.PROFILE_TABLE_NAME);
  }
  const policies = Object.values(template.findResources('AWS::IAM::Policy'));
  const rendered = JSON.stringify(policies);
  assert.match(rendered, /dynamodb:PutItem/);
  assert.doesNotMatch(rendered, /"Resource":"\*"/);
  assert.doesNotMatch(rendered, /cognito-idp:Admin/);
});

test('profile API requires a Cognito JWT except for the public availability check', () => {
  const { template } = synthAuthStack();
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
    AuthorizerType: 'JWT',
    IdentitySource: ['$request.header.Authorization'],
  });

  const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route')) as Array<{
    Properties: { RouteKey: string; AuthorizationType?: string };
  }>;
  const byKey = Object.fromEntries(
    routes.map((route) => [route.Properties.RouteKey, route.Properties.AuthorizationType ?? 'NONE']),
  );
  assert.deepEqual(byKey, {
    'GET /api/profile': 'JWT',
    'PUT /api/profile/gamer-tag': 'JWT',
    'PUT /api/profile/avatar': 'JWT',
    'GET /api/gamer-tags/{tag}': 'NONE',
  });
});

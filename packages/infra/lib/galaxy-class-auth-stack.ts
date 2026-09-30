import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  AccountRecovery,
  FeaturePlan,
  Mfa,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolEmail,
} from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, '../../..');
const accountsLambdaDir = path.join(monorepoRoot, 'packages/accounts/src/lambda');

export const PROFILE_API_THROTTLE = { rateLimit: 20, burstLimit: 40 } as const;

/**
 * Prod Cognito pool and public SRP client for Galaxy Class email/password
 * accounts, plus the player profile (gamer tag + avatar) service:
 * a DynamoDB table that holds gamer tag locks, Cognito triggers that reserve a
 * tag at sign-up and claim it on confirmation, and a JWT-protected HTTP API the
 * site reaches same-origin at /api/*.
 * SES domain verification and live deploy are outside this stack.
 */
export class GalaxyClassAuthStack extends Stack {
  /** execute-api host for the site distribution's /api/* origin. */
  readonly profileApiDomainName: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const profiles = new Table(this, 'Profiles', {
      tableName: 'galaxyclass-profiles-prod',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const accountsFunction = (constructId: string, entry: string, description: string) => {
      const fn = new NodejsFunction(this, constructId, {
        description,
        runtime: Runtime.NODEJS_22_X,
        entry: path.join(accountsLambdaDir, entry),
        projectRoot: monorepoRoot,
        handler: 'handler',
        memorySize: 256,
        timeout: Duration.seconds(5),
        environment: { PROFILE_TABLE_NAME: profiles.tableName },
        bundling: {
          target: 'node22',
          format: OutputFormat.ESM,
          externalModules: ['@aws-sdk/*'],
        },
        depsLockFilePath: path.join(monorepoRoot, 'package-lock.json'),
      });
      profiles.grantReadWriteData(fn);
      return fn;
    };

    const signUpTriggers = accountsFunction(
      'ProfileTriggers',
      'cognito-triggers.ts',
      'Reserves a gamer tag at sign-up and claims it on confirmation.',
    );

    const userPool = new UserPool(this, 'Players', {
      userPoolName: 'galaxyclass-players-prod',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      email: UserPoolEmail.withSES({
        fromEmail: 'noreply@galaxyclass.app',
        sesVerifiedDomain: 'galaxyclass.app',
      }),
      mfa: Mfa.OFF,
      featurePlan: FeaturePlan.ESSENTIALS,
      lambdaTriggers: {
        preSignUp: signUpTriggers,
        postConfirmation: signUpTriggers,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const client = userPool.addClient('Web', {
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: false,
        adminUserPassword: false,
        custom: false,
      },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
    });

    const profileApiFunction = accountsFunction(
      'ProfileApiHandler',
      'profile-api.ts',
      'Galaxy Class player profile API (gamer tag and avatar).',
    );

    const profileApi = new HttpApi(this, 'ProfileApi', {
      apiName: 'galaxyclass-profile-prod',
      description: 'Galaxy Class player profiles, served same-origin through the site at /api/*.',
      createDefaultStage: false,
    });
    profileApi.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      throttle: PROFILE_API_THROTTLE,
    });

    const integration = new HttpLambdaIntegration('ProfileApiIntegration', profileApiFunction);
    const authorizer = new HttpUserPoolAuthorizer('PlayersAuthorizer', userPool, {
      userPoolClients: [client],
    });

    profileApi.addRoutes({
      path: '/api/profile',
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });
    profileApi.addRoutes({
      path: '/api/profile/gamer-tag',
      methods: [HttpMethod.PUT],
      integration,
      authorizer,
    });
    profileApi.addRoutes({
      path: '/api/profile/avatar',
      methods: [HttpMethod.PUT],
      integration,
      authorizer,
    });
    profileApi.addRoutes({
      path: '/api/gamer-tags/{tag}',
      methods: [HttpMethod.GET],
      integration,
    });

    this.profileApiDomainName = `${profileApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`;

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'Region', { value: this.region });
  }
}

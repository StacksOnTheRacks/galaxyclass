import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  Mfa,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolEmail,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

/**
 * Prod Cognito pool and public SRP client for Galaxy Class email/password accounts.
 * SES domain verification and live deploy are outside this stack.
 */
export class GalaxyClassAuthStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'Region', { value: this.region });
  }
}

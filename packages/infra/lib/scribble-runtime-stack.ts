import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, CustomResource, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as customResources from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import type { PlayerAuthRefs } from './galaxy-class-auth-stack.js';
import { SCRIBBLE_SEEDED_TABLES } from './scribble-seeded-tables.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, '../../..');
const scribblePackageRoot = path.join(monorepoRoot, 'packages/scribble');
export const SCRIBBLE_ARTIFACT_DIR = path.join(scribblePackageRoot, 'public/scribble');
const DICTIONARY_SOURCE = 'packages/scribble/dictionary/enable1.txt';
export const SCRIBBLE_DICTIONARY_FILE = 'enable1.txt';
/** Lambda unpacks the bundle to /var/task; the dictionary is copied beside index.mjs. */
export const SCRIBBLE_DICTIONARY_PATH = `/var/task/${SCRIBBLE_DICTIONARY_FILE}`;

/** Matches layer:ScribbleRuntimeStack* in packages/infra/iam/scribble-runtime-cfn-exec.json. */
export const SCRIBBLE_DEPLOY_LAYER_NAME = 'ScribbleRuntimeStackPlayOriginCli';

export interface ScribbleRuntimeStackProps extends StackProps {
  /** Galaxy Class player pool; without it every player sits as a guest. */
  playerAuth?: PlayerAuthRefs;
}

export class ScribbleRuntimeStack extends Stack {
  readonly webSocketUrl: string;
  readonly playOriginBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: ScribbleRuntimeStackProps) {
    super(scope, id, props);
    const playerAuth = props?.playerAuth;
    if (!existsSync(path.join(SCRIBBLE_ARTIFACT_DIR, 'index.html'))) {
      throw new Error(`Scribble client is not built at ${SCRIBBLE_ARTIFACT_DIR}; run npm run build:scribble first.`);
    }

    const table = new dynamodb.Table(this, 'ScribbleTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'byTable',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const handler = new lambdaNodejs.NodejsFunction(this, 'ScribbleRuntimeHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(scribblePackageRoot, 'src/runtime/handler.ts'),
      projectRoot: monorepoRoot,
      handler: 'handler',
      // The word list loads into a Set on cold start; more memory buys CPU for that.
      memorySize: 1024,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        DICTIONARY_PATH: SCRIBBLE_DICTIONARY_PATH,
        ...(playerAuth
          ? {
              COGNITO_USER_POOL_ID: playerAuth.userPoolId,
              COGNITO_CLIENT_ID: playerAuth.userPoolClientId,
              PROFILE_TABLE_NAME: playerAuth.profileTableName,
            }
          : {}),
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: ['@aws-sdk/*'],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `cp "${inputDir}/${DICTIONARY_SOURCE}" "${outputDir}/${SCRIBBLE_DICTIONARY_FILE}"`,
          ],
        },
      },
      depsLockFilePath: path.join(monorepoRoot, 'package-lock.json'),
    });

    table.grantReadWriteData(handler);
    if (playerAuth) {
      // Read-only: the studio's profile API is the only writer of gamer tags and avatars.
      handler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem'],
          resources: [playerAuth.profileTableArn],
        }),
      );
    }

    const webSocketApi = new apigwv2.WebSocketApi(this, 'ScribbleWebSocketApi', {
      connectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('ConnectIntegration', handler),
      },
      disconnectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('DisconnectIntegration', handler),
      },
      defaultRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('DefaultIntegration', handler),
      },
    });
    const stage = new apigwv2.WebSocketStage(this, 'ScribbleWebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });
    this.webSocketUrl = stage.url;

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          Stack.of(this).formatArn({
            service: 'execute-api',
            resource: webSocketApi.apiId,
            resourceName: `${stage.stageName}/POST/@connections/*`,
          }),
        ],
      }),
    );

    const seedHandler = new lambdaNodejs.NodejsFunction(this, 'ScribbleSeedTableHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, 'scribble-seed-table-handler.ts'),
      projectRoot: monorepoRoot,
      handler: 'handler',
      timeout: Duration.seconds(30),
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
        externalModules: ['@aws-sdk/*'],
      },
      depsLockFilePath: path.join(monorepoRoot, 'package-lock.json'),
    });
    seedHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [table.tableArn],
      }),
    );
    const seedProvider = new customResources.Provider(this, 'ScribbleSeedTableProvider', {
      onEventHandler: seedHandler,
    });

    const seededTables = SCRIBBLE_SEEDED_TABLES.map((spec) => {
      const seeded = new CustomResource(this, spec.constructId, {
        serviceToken: seedProvider.serviceToken,
        resourceType: 'Custom::SeededScribbleTable',
        properties: { TableName: table.tableName, TableLabel: spec.name },
      });
      return { id: seeded.getAttString('TableId'), name: spec.name, blurb: spec.blurb };
    });

    const playOriginBucket = new s3.Bucket(this, 'ScribblePlayOriginBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // GalaxyClassSite-prod owns the bucket policy (CloudFront read + TLS deny).
      enforceSSL: false,
    });
    this.playOriginBucket = playOriginBucket;

    const playOriginDeployment = new s3Deployment.BucketDeployment(this, 'ScribblePlayOriginDeployment', {
      destinationBucket: playOriginBucket,
      destinationKeyPrefix: 'scribble',
      sources: [
        s3Deployment.Source.asset(SCRIBBLE_ARTIFACT_DIR),
        s3Deployment.Source.jsonData('config.json', {
          webSocketUrl: this.webSocketUrl,
          tables: seededTables,
          ...(playerAuth
            ? { auth: { userPoolId: playerAuth.userPoolId, userPoolClientId: playerAuth.userPoolClientId } }
            : {}),
        }),
      ],
      // Entry files are not content-hashed; a stale client must not outlive a runtime protocol change.
      cacheControl: [s3Deployment.CacheControl.noCache()],
    });
    nameBucketDeployLayer(playOriginDeployment, SCRIBBLE_DEPLOY_LAYER_NAME);

    new CfnOutput(this, 'WebSocketUrl', { value: stage.url });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'PlayOriginBucketName', { value: playOriginBucket.bucketName });
    new CfnOutput(this, 'LobbyUrl', { value: 'https://galaxyclass.app/scribble' });
    new CfnOutput(this, 'SeededTableId', { value: seededTables[0]!.id });
  }
}

function nameBucketDeployLayer(deployment: Construct, layerName: string): void {
  const layer = deployment.node.findAll().find((child) => child.node.id === 'AwsCliLayer');
  const cfnLayer = layer?.node.defaultChild;
  if (cfnLayer instanceof lambda.CfnLayerVersion) {
    cfnLayer.layerName = layerName;
  }
}

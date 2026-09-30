import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as customResources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { buildSeededTableListing, SEEDED_TABLES } from './seeded-table-listing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, '../../..');
const rifflePackageRoot = path.join(monorepoRoot, 'packages/riffle');
export const DASHBOARD_ARTIFACT_DIR = path.join(rifflePackageRoot, 'public/dashboard');
export const PLAY_ORIGIN_ARTIFACT_DIR = path.join(rifflePackageRoot, 'public/dashboard-riffle');

/** Matches RifflePokerMatchRuntimeCfnExec layer:MatchRuntimeStack*. */
export const PLAY_ORIGIN_DEPLOY_LAYER_NAME = 'MatchRuntimeStackPlayOriginCli';

export class MatchRuntimeStack extends Stack {
  readonly webSocketUrl: string;
  readonly playOriginBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'MatchTable', {
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

    const handler = new lambdaNodejs.NodejsFunction(this, 'MatchRuntimeHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(rifflePackageRoot, 'src/runtime/handler.ts'),
      projectRoot: monorepoRoot,
      handler: 'handler',
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: ['@aws-sdk/*'],
      },
      depsLockFilePath: path.join(monorepoRoot, 'package-lock.json'),
    });

    table.grantReadWriteData(handler);

    const webSocketApi = new apigwv2.WebSocketApi(this, 'MatchWebSocketApi', {
      connectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          handler,
        ),
      },
      disconnectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          handler,
        ),
      },
      defaultRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          handler,
        ),
      },
    });

    const stage = new apigwv2.WebSocketStage(this, 'MatchWebSocketStage', {
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

    new CfnOutput(this, 'WebSocketUrl', {
      value: stage.url,
    });

    new CfnOutput(this, 'TableName', {
      value: table.tableName,
    });

    const seedHandler = new lambdaNodejs.NodejsFunction(this, 'SeedTableHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, 'seed-table-handler.ts'),
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
        actions: ['dynamodb:PutItem'],
        resources: [table.tableArn],
      }),
    );

    const seedProvider = new customResources.Provider(this, 'SeedTableProvider', {
      onEventHandler: seedHandler,
    });

    const seededTableListings = SEEDED_TABLES.map((spec) => {
      const seededTable = new CustomResource(this, spec.constructId, {
        serviceToken: seedProvider.serviceToken,
        resourceType: 'Custom::SeededPokerTable',
        properties: {
          TableName: table.tableName,
          SmallBlind: spec.smallBlind,
          BigBlind: spec.bigBlind,
          DefaultStack: spec.defaultStack,
        },
      });
      return buildSeededTableListing(seededTable.getAttString('TableId'), spec);
    });
    const seededTableId = seededTableListings[0]!.id;

    new CfnOutput(this, 'SeededTableId', {
      value: seededTableId,
    });

    new CfnOutput(this, 'PlayUrl', {
      value: `https://galaxyclass.app/riffle/${seededTableId}`,
    });

    const siteBucket = new s3.Bucket(this, 'DashboardSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const spaFallback = (httpStatus: number): cloudfront.ErrorResponse => ({
      httpStatus,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.seconds(0),
    });

    const distribution = new cloudfront.Distribution(this, 'DashboardDistribution', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [spaFallback(403), spaFallback(404)],
    });

    new s3Deployment.BucketDeployment(this, 'DashboardSiteDeployment', {
      destinationBucket: siteBucket,
      sources: [
        s3Deployment.Source.asset(DASHBOARD_ARTIFACT_DIR),
        s3Deployment.Source.jsonData('config.json', {
          webSocketUrl: this.webSocketUrl,
          tables: seededTableListings,
        }),
      ],
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'DashboardUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });

    const playOriginBucket = new s3.Bucket(this, 'PlayOriginBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // GalaxyClassSite-prod owns the bucket policy (CloudFront read + TLS deny).
      enforceSSL: false,
    });
    this.playOriginBucket = playOriginBucket;

    const playOriginDeployment = new s3Deployment.BucketDeployment(this, 'PlayOriginDeployment', {
      destinationBucket: playOriginBucket,
      destinationKeyPrefix: 'riffle',
      sources: [
        s3Deployment.Source.asset(PLAY_ORIGIN_ARTIFACT_DIR),
        s3Deployment.Source.jsonData('config.json', {
          webSocketUrl: this.webSocketUrl,
          tables: seededTableListings,
        }),
      ],
    });
    nameBucketDeployLayer(playOriginDeployment, PLAY_ORIGIN_DEPLOY_LAYER_NAME);

    new CfnOutput(this, 'PlayOriginBucketName', {
      value: playOriginBucket.bucketName,
    });

  }
}

function nameBucketDeployLayer(deployment: Construct, layerName: string): void {
  const layer = deployment.node.findAll().find((child) => child.node.id === 'AwsCliLayer');
  const cfnLayer = layer?.node.defaultChild;
  if (cfnLayer instanceof lambda.CfnLayerVersion) {
    cfnLayer.layerName = layerName;
  }
}

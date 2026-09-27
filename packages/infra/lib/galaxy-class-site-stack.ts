import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AnyPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, CfnBucketPolicy, type IBucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnLayerVersion } from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';
import { canonicalRedirectFunctionCode } from './cloudfront-canonical-redirect.js';

export const HOSTED_ZONE_ID = 'Z02927871LCJW2KMZGKOP';
export const ZONE_NAME = 'galaxyclass.app';
export const APEX_HOST = 'galaxyclass.app';
export const WWW_HOST = 'www.galaxyclass.app';
export const SITE_URL = 'https://galaxyclass.app';
/** Matches cdk-galcls-cfn-exec-role lambda permissions on layer:GalaxyClass*. */
export const STUDIO_DEPLOY_LAYER_NAME = 'GalaxyClassSiteStudioAssetsCli';

export const STUDIO_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com; frame-src 'none'; upgrade-insecure-requests";

export const RIFFLE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss://*.execute-api.us-east-1.amazonaws.com; frame-src 'none'; upgrade-insecure-requests";

export interface GalaxyClassSiteStackProps extends StackProps {
  /** Studio static export directory. Tests pass a fixture; production may pass repo out/. */
  studioAssetPath: string;
  /** Play-origin bucket name from MatchRuntimeStack (cross-stack token). Omit for studio-only synth. */
  rifflePlayOriginBucketName?: string;
}

/**
 * Prod static site: private studio origin, Riffle origin from SSM, apex canonical host.
 * Live deploy, ACM ISSUED, and the Riffle parameter existing in AWS are other tickets.
 */
export class GalaxyClassSiteStack extends Stack {
  constructor(scope: Construct, id: string, props: GalaxyClassSiteStackProps) {
    super(scope, id, props);

    const zone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ZONE_NAME,
    });

    const certificate = new Certificate(this, 'SiteCertificate', {
      domainName: APEX_HOST,
      subjectAlternativeNames: [WWW_HOST],
      validation: CertificateValidation.fromDns(zone),
    });

    const studioBucket = new Bucket(this, 'StudioOrigin', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const riffleBucket = props.rifflePlayOriginBucketName
      ? Bucket.fromBucketName(this, 'RifflePlayOrigin', props.rifflePlayOriginBucketName)
      : undefined;

    const originAccessControl = new S3OriginAccessControl(this, 'OriginAccessControl');
    const studioOrigin = S3BucketOrigin.withOriginAccessControl(studioBucket, { originAccessControl });
    const riffleOrigin = riffleBucket
      ? S3BucketOrigin.withOriginAccessControl(riffleBucket, { originAccessControl })
      : undefined;

    const viewerRequest = new Function(this, 'CanonicalRedirect', {
      code: FunctionCode.fromInline(canonicalRedirectFunctionCode),
      runtime: FunctionRuntime.JS_2_0,
    });

    const hsts = {
      accessControlMaxAge: Duration.seconds(31536000),
      includeSubdomains: true,
      preload: false,
      override: true,
    };
    const studioHeaders = new ResponseHeadersPolicy(this, 'StudioHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: hsts,
        contentSecurityPolicy: { contentSecurityPolicy: STUDIO_CSP, override: true },
      },
    });
    const riffleHeaders = riffleOrigin
      ? new ResponseHeadersPolicy(this, 'RiffleHeaders', {
          securityHeadersBehavior: {
            strictTransportSecurity: hsts,
            contentSecurityPolicy: { contentSecurityPolicy: RIFFLE_CSP, override: true },
          },
        })
      : undefined;

    const behavior = {
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      compress: true,
      functionAssociations: [
        {
          function: viewerRequest,
          eventType: FunctionEventType.VIEWER_REQUEST,
        },
      ],
    };

    const distribution = new Distribution(this, 'Site', {
      certificate,
      domainNames: [APEX_HOST, WWW_HOST],
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: studioOrigin,
        responseHeadersPolicy: studioHeaders,
        ...behavior,
      },
      additionalBehaviors:
        riffleOrigin && riffleHeaders
          ? {
              '/riffle': {
                origin: riffleOrigin,
                responseHeadersPolicy: riffleHeaders,
                ...behavior,
              },
              '/riffle/*': {
                origin: riffleOrigin,
                responseHeadersPolicy: riffleHeaders,
                ...behavior,
              },
            }
          : undefined,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    });

    if (riffleBucket) {
      grantRiffleOriginRead(this, riffleBucket, distribution.distributionId);
    }

    new ARecord(this, 'ApexAlias', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
    new ARecord(this, 'WwwAlias', {
      zone,
      recordName: 'www',
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    const studioAssets = new BucketDeployment(this, 'StudioAssets', {
      sources: [Source.asset(props.studioAssetPath)],
      destinationBucket: studioBucket,
      distribution,
      distributionPaths: ['/*'],
    });
    nameStudioDeployLayer(studioAssets);

    new CfnOutput(this, 'BucketName', { value: studioBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'SiteUrl', { value: SITE_URL });
    new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}

function nameStudioDeployLayer(deployment: Construct): void {
  const layer = deployment.node.findAll().find((child) => child.node.id === 'AwsCliLayer');
  const cfnLayer = layer?.node.defaultChild;
  if (cfnLayer instanceof CfnLayerVersion) {
    cfnLayer.layerName = STUDIO_DEPLOY_LAYER_NAME;
  }
}

function grantRiffleOriginRead(scope: Stack, bucket: IBucket, distributionId: string): void {
  new CfnBucketPolicy(scope, 'RiffleOriginReadPolicy', {
    bucket: bucket.bucketName,
    policyDocument: new PolicyDocument({
      statements: [
        new PolicyStatement({
          principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects('*')],
          conditions: {
            StringEquals: {
              'AWS:SourceArn': `arn:${Aws.PARTITION}:cloudfront::${Aws.ACCOUNT_ID}:distribution/${distributionId}`,
            },
          },
        }),
        new PolicyStatement({
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['s3:*'],
          resources: [bucket.bucketArn, bucket.arnForObjects('*')],
          conditions: {
            Bool: { 'aws:SecureTransport': 'false' },
          },
        }),
      ],
    }),
  });
}

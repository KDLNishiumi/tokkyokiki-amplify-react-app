import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { sampleApi } from './api/resource';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2a from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2i from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

const backend = defineBackend({
  auth,
  data,
  storage,
  sampleApi,
});

const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy.MinimumLength', 8);
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy.RequireLowercase', true);
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy.RequireUppercase', true);
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy.RequireNumbers', true);
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy.RequireSymbols', true);

const isProduction = process.env.AWS_BRANCH === 'production';

const sampleLambda = backend.sampleApi.resources.lambda;
const stack = Stack.of(sampleLambda);

const api = new apigwv2.HttpApi(stack, 'BackendHttpApi', {
  corsPreflight: {
    allowOrigins: ['*'],
    allowMethods: [
      apigwv2.CorsHttpMethod.GET,
      apigwv2.CorsHttpMethod.POST,
      apigwv2.CorsHttpMethod.OPTIONS,
    ],
    allowHeaders: ['*'],
  },
});

const iamAuthorizer = new apigwv2a.HttpIamAuthorizer();
const kintoneRoutes = api.addRoutes({
  path: '/kintone-sync',
  methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
  integration: new apigwv2i.HttpLambdaIntegration('SampleIntegration', sampleLambda),
  authorizer: iamAuthorizer,
});

const authenticatedRole = backend.auth.resources.authenticatedUserIamRole;
for (const route of kintoneRoutes) {
  route.grantInvoke(authenticatedRole);
}

api.addRoutes({
  path: '/user-signup',
  methods: [apigwv2.HttpMethod.POST],
  integration: new apigwv2i.HttpLambdaIntegration('UserSignUpIntegration', sampleLambda),
});

sampleLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['cognito-idp:SignUp'],
    resources: ['*'],
  })
);

sampleLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword'],
    resources: ['*'],
  })
);

sampleLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

const apiBaseUrlRaw = api.url ?? api.apiEndpoint;
const apiBaseUrl = apiBaseUrlRaw.endsWith('/') ? apiBaseUrlRaw : `${apiBaseUrlRaw}/`;

backend.addOutput({
  custom: {
    apiBaseUrl,
    kintoneSyncUrl: `${apiBaseUrl}kintone-sync`,
    userSignUpUrl: `${apiBaseUrl}user-signup`,
  },
});

const inviteBucket = new s3.Bucket(stack, 'InviteBucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: RemovalPolicy.RETAIN,
});

inviteBucket.grantRead(sampleLambda);
const sampleLambdaFunction = sampleLambda as unknown as lambda.Function;
sampleLambdaFunction.addEnvironment('INVITE_BUCKET', inviteBucket.bucketName);
inviteBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(sampleLambda)
);

if (isProduction) {
  const natEip = new ec2.CfnEIP(stack, 'NatGatewayEIP', {
    domain: 'vpc',
  });

  const vpc = new ec2.Vpc(stack, 'AppVpc', {
    maxAzs: 2,
    natGateways: 1,
    natGatewayProvider: ec2.NatProvider.gateway({
      eipAllocationIds: [natEip.ref],
    }),
    subnetConfiguration: [
      {
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 24,
      },
      {
        name: 'Private',
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 24,
      },
    ],
  });

  const securityGroup = new ec2.SecurityGroup(stack, 'LambdaSecurityGroup', {
    vpc,
    allowAllOutbound: true,
  });

  const attachLambdaToVpc = (targetLambda: lambda.IFunction) => {
    targetLambda.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
    );
    const cfnFunction = targetLambda.node.defaultChild as lambda.CfnFunction;
    cfnFunction.vpcConfig = {
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
      securityGroupIds: [securityGroup.securityGroupId],
    };
  };

  attachLambdaToVpc(sampleLambda);
}

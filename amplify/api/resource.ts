import { defineFunction } from '@aws-amplify/backend';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

type AmplifyOutputs = {
  auth?: {
    user_pool_client_id?: string;
    user_pool_id?: string;
  };
};

const loadAmplifyOutputs = (): AmplifyOutputs => {
  try {
    return require('../../amplify_outputs.json') as AmplifyOutputs;
  } catch {
    return {};
  }
};

const outputs = loadAmplifyOutputs();
const userPoolClientId =
  process.env.AWS_USER_POOL_CLIENT_ID ?? outputs.auth?.user_pool_client_id ?? '';
const userPoolId = process.env.AWS_USER_POOL_ID ?? outputs.auth?.user_pool_id ?? '';
const signUpApiKey = process.env.SIGNUP_API_KEY ?? 'dummy-signup-key';
const inviteBucket = process.env.INVITE_BUCKET ?? '';
const fromEmail = process.env.FROM_EMAIL ?? 'nishiumi@kdl.co.jp';
const serviceName = process.env.SERVICE_NAME ?? 'App Service';
const loginUrl = process.env.LOGIN_URL ?? 'http://localhost:5173/';

export const sampleApi = defineFunction({
  entry: './handlers/sample.ts',
  runtime: 22,
  environment: {
    ALLOW_ORIGIN: '*',
    USER_POOL_CLIENT_ID: userPoolClientId,
    SIGNUP_API_KEY: signUpApiKey,
    USER_POOL_ID: userPoolId,
    INVITE_BUCKET: inviteBucket,
    FROM_EMAIL: fromEmail,
    SERVICE_NAME: serviceName,
    LOGIN_URL: loginUrl,
  },
});

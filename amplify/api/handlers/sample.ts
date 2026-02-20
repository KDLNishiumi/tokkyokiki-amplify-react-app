type HttpEvent = {
  Records?: Array<{
    s3?: unknown;
  }>;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
};

type HttpResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export const handler = async (event: HttpEvent): Promise<HttpResponse> => {
  if (event.Records?.[0]?.s3) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'S3 event received.' }),
    };
  }

  const method = event.requestContext?.http?.method;
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-api-key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (method !== 'GET' && method !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ message: 'Hello World' }),
  };
};

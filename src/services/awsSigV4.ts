// Minimal AWS Signature Version 4 signer for browser fetch requests.
// Implemented from scratch against the AWS docs because the repo does not
// bundle the AWS SDK. Only supports the request shape used for Polly
// SynthesizeSpeech / DescribeVoices: single host, UTF-8 request body, no
// session token unless supplied, no chunked payload.
//
// Intentionally small surface. If other services need signing later, extend
// this helper rather than duplicating it.

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignedRequestInit {
  url: string;
  init: RequestInit;
}

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const hex = bytes[i].toString(16);
    out += hex.length === 1 ? `0${hex}` : hex;
  }
  return out;
};

const sha256 = async (data: string | ArrayBuffer): Promise<ArrayBuffer> => {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return crypto.subtle.digest('SHA-256', bytes);
};

const hmac = async (
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
};

const deriveSigningKey = async (
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> => {
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const amzDateStamps = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
};

const canonicalUri = (pathname: string): string => {
  if (!pathname) return '/';
  // AWS expects each path segment to be URI-encoded but slashes preserved.
  return pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%2F/g, '%2F'))
    .join('/');
};

const canonicalQueryString = (searchParams: URLSearchParams): string => {
  const entries: Array<[string, string]> = [];
  searchParams.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
};

export interface SignOptions {
  method: string;
  url: string;
  service: string;
  region: string;
  credentials: SigV4Credentials;
  headers?: Record<string, string>;
  body?: string;
  /** Override the signing date (used only for tests). */
  date?: Date;
}

export const signAwsRequest = async (
  options: SignOptions,
): Promise<SignedRequestInit> => {
  const {
    method,
    url,
    service,
    region,
    credentials,
    headers: extraHeaders = {},
    body = '',
    date = new Date(),
  } = options;

  const parsed = new URL(url);
  const { amzDate, dateStamp } = amzDateStamps(date);
  const payloadHash = toHex(await sha256(body || ''));

  const baseHeaders: Record<string, string> = {
    host: parsed.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...extraHeaders,
  };
  if (credentials.sessionToken) {
    baseHeaders['x-amz-security-token'] = credentials.sessionToken;
  }

  const sortedHeaderNames = Object.keys(baseHeaders)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${baseHeaders[Object.keys(baseHeaders).find((h) => h.toLowerCase() === name) as string].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri(parsed.pathname),
    canonicalQueryString(parsed.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest)),
  ].join('\n');

  const signingKey = await deriveSigningKey(
    credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalHeaders: Record<string, string> = {
    ...baseHeaders,
    Authorization: authorization,
  };
  // The browser fetch API forbids setting Host, so strip it before returning.
  delete finalHeaders.host;
  delete finalHeaders.Host;

  return {
    url,
    init: {
      method,
      headers: finalHeaders,
      body: body || undefined,
    },
  };
};

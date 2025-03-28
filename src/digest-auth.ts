import crypto from 'crypto';
import fetch, { RequestInit } from 'node-fetch';

export interface AuthParams {
  realm: string;
  nonce: string;
  [key: string]: string;
}

export interface DigestOptions {
  url: string;
  username: string;
  password: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface DigestHeaderOptions extends DigestOptions {
  retryCount?: number;
  maxRetries?: number;
}

// Parse the WWW-Authenticate header to get necessary parts
export function parseAuthHeader(authHeader: string): AuthParams {
  const regex = /(\w+)="([^"]+)"/g;
  const authParams: AuthParams = {
    realm: '',
    nonce: ''
  };
  let match;

  while (match = regex.exec(authHeader)) {
    authParams[match[1]] = match[2];
  }

  if (!authParams.realm || !authParams.nonce) {
    throw new Error('Missing required digest authentication parameters');
  }

  return authParams;
}

// Construct the Digest Authorization header
export function constructDigestAuthHeader(authParams: AuthParams, options: DigestOptions): string {
  const { realm, nonce } = authParams;
  const { url, username, password, method = 'POST' } = options;

  // Generate cnonce and nc (nonce count)
  const cnonce = crypto.randomBytes(16).toString('hex');
  const nc = '00000001';
  const qop = 'auth';

  // Create A1 and A2 hashes (used in Digest calculation)
  const A1 = `${username}:${realm}:${password}`;
  const A2 = `${method}:${url}`;

  const ha1 = crypto.createHash('md5').update(A1).digest('hex');
  const ha2 = crypto.createHash('md5').update(A2).digest('hex');

  // Generate the response hash (Digest Authentication response)
  const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');

  // Construct the final Digest Authorization header
  return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${url}", cnonce="${cnonce}", nc=${nc}, qop=${qop}, response="${response}"`;
}

/**
 * Get a Digest Authentication header for a given URL and credentials
 * @param options Configuration options for digest authentication
 * @returns Promise resolving to the Digest Authorization header
 */
export async function getDigestHeader(options: DigestHeaderOptions): Promise<string | undefined> {
  const { url, username, password, method = 'GET', headers = {}, retryCount = 0, maxRetries = 3 } = options;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'node-fetch',
        'Accept': '*/*',
        ...headers
      },
    });

    const wwwAuthenticate = response.headers.get('www-authenticate');
    if (!wwwAuthenticate) {
      throw new Error('No WWW-Authenticate header received');
    }

    // Parse the Digest Authentication challenge
    const authParams = parseAuthHeader(wwwAuthenticate);

    const digestHeader = constructDigestAuthHeader(authParams, { url, username, password, method });

    return digestHeader;
  } catch (error) {
    console.error('Error in getting WWW-Authenticate header:', error);
    
    // Retry logic for connection issues
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getDigestHeader({ ...options, retryCount: retryCount + 1 });
    }
    
    return undefined;
  }
} 
/**
 * Verus RPC Client
 *
 * Fetch-based JSON-RPC 1.0 client. Two modes:
 *
 * 1. **Public RPC** (default) — talks to the public Verus mainnet RPC
 *    endpoints. `rpc.vrsc.syncproof.net` is primary because it has
 *    `decryptdata` whitelisted; `api.verus.services` is the fallback (covers
 *    network-level outages on syncproof but does not have decryptdata, so
 *    encrypted reads degrade gracefully there).
 *
 * 2. **Local daemon** (opt-in) — set `VERUS_RPC_URL` to point the MCP at
 *    your own daemon. Required for testnet (no public testnet RPC has
 *    decryptdata) and recommended for high-volume agents, custom chains,
 *    or privacy-conscious use. Auth via env vars or VRSC.conf — see the
 *    `getRpcEndpoints` block below.
 *
 * Adapted from vtimestamp/src/lib/server/verus.ts; auth pattern mirrors
 * vtimestamp-mcp-write/src/verus-rpc.ts.
 */

import { readFileSync } from 'node:fs';
import type {
  IdentityHistoryResponse,
  BlockData,
  DataDescriptor,
  DecryptedDataDescriptor,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const RPC_TIMEOUT = 30_000;

const PUBLIC_RPC_ENDPOINTS = {
  primary: 'https://rpc.vrsc.syncproof.net',
  fallback: 'https://api.verus.services',
} as const;

interface RpcEndpoint {
  url: string;
  user?: string;
  password?: string;
}

interface ConfValues {
  rpcuser?: string;
  rpcpassword?: string;
  rpcport?: string;
}

function parseVrscConf(confPath: string): ConfValues | null {
  try {
    const content = readFileSync(confPath, 'utf-8');
    const values: ConfValues = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key === 'rpcuser') values.rpcuser = value;
      else if (key === 'rpcpassword') values.rpcpassword = value;
      else if (key === 'rpcport') values.rpcport = value;
    }
    return values;
  } catch {
    return null;
  }
}

let cachedEndpoints: RpcEndpoint[] | null = null;

/**
 * Decide the endpoint(s) to try, in order. Local daemon if any of
 * `VERUS_RPC_URL` / `VERUS_CONF_PATH` is set; public RPC pair otherwise.
 *
 * - `VERUS_RPC_URL` set → single local endpoint at that URL. Auth comes from
 *   `VERUS_RPC_USER` + `VERUS_RPC_PASSWORD`, or from a conf file at
 *   `VERUS_CONF_PATH` if those env vars are missing.
 * - Only `VERUS_CONF_PATH` set → parse it; URL = `http://127.0.0.1:<rpcport>`
 *   (defaults 27486 for mainnet; vrsctest.conf typically has rpcport=18843).
 * - Neither set → public RPC pair, no auth, current behavior.
 */
function getRpcEndpoints(): RpcEndpoint[] {
  if (cachedEndpoints) return cachedEndpoints;

  const rpcUrl = process.env.VERUS_RPC_URL;
  const confPath = process.env.VERUS_CONF_PATH;

  if (rpcUrl) {
    const conf = confPath ? parseVrscConf(confPath) : null;
    cachedEndpoints = [{
      url: rpcUrl,
      user: process.env.VERUS_RPC_USER || conf?.rpcuser,
      password: process.env.VERUS_RPC_PASSWORD || conf?.rpcpassword,
    }];
    return cachedEndpoints;
  }

  if (confPath) {
    const conf = parseVrscConf(confPath);
    if (conf) {
      cachedEndpoints = [{
        url: `http://127.0.0.1:${conf.rpcport || '27486'}`,
        user: conf.rpcuser,
        password: conf.rpcpassword,
      }];
      return cachedEndpoints;
    }
  }

  cachedEndpoints = [
    { url: PUBLIC_RPC_ENDPOINTS.primary },
    { url: PUBLIC_RPC_ENDPOINTS.fallback },
  ];
  return cachedEndpoints;
}

// ============================================================================
// Error Class
// ============================================================================

export class VerusRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'VerusRpcError';
    this.code = code;
  }
}

export const RPC_ERROR_CODES = {
  IDENTITY_NOT_FOUND: -5,
} as const;

// ============================================================================
// RPC Client
// ============================================================================

interface RpcResponse<T> {
  result: T | null;
  error: { code: number; message: string } | null;
  id: string;
}

async function rpcCallToEndpoint<T>(
  endpoint: RpcEndpoint,
  method: string,
  params: unknown[] = []
): Promise<T> {
  const request = {
    jsonrpc: '1.0' as const,
    id: `vtimestamp-mcp-${Date.now()}`,
    method,
    params,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
  };

  if (endpoint.user && endpoint.password) {
    const credentials = Buffer.from(`${endpoint.user}:${endpoint.password}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(RPC_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: RpcResponse<T> = await response.json();

  if (data.error) {
    throw new VerusRpcError(data.error.code, data.error.message);
  }

  if (data.result === null) {
    throw new Error(`RPC returned null result for method ${method}`);
  }

  return data.result;
}

/**
 * Make an RPC call, walking the configured endpoint list on network errors.
 * RPC errors (like identity not found, or method not whitelisted) are NOT
 * retried on the next endpoint — they're authoritative responses.
 */
async function rpcCall<T>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const endpoints = getRpcEndpoints();
  let lastNetworkError: unknown;

  for (const endpoint of endpoints) {
    try {
      return await rpcCallToEndpoint<T>(endpoint, method, params);
    } catch (error) {
      if (error instanceof VerusRpcError) {
        throw error;
      }
      lastNetworkError = error;
    }
  }

  throw lastNetworkError ?? new Error(`No RPC endpoints configured for ${method}`);
}

// ============================================================================
// RPC Methods
// ============================================================================

export async function getIdentityHistory(
  identity: string
): Promise<IdentityHistoryResponse> {
  return rpcCall<IdentityHistoryResponse>('getidentityhistory', [identity]);
}

export async function getBlock(
  blockhash: string
): Promise<BlockData> {
  return rpcCall<BlockData>('getblock', [blockhash]);
}

/**
 * Decrypt an on-chain flags:13 DataDescriptor produced by the daemon's
 * `{data:{}}` envelope. `retrieve: true` follows the indirect reference
 * back to the ciphertext stored in the originating transaction.
 */
export async function decryptData(
  datadescriptor: DataDescriptor,
  txid: string
): Promise<DecryptedDataDescriptor[]> {
  return rpcCall<DecryptedDataDescriptor[]>('decryptdata', [
    { datadescriptor, txid, retrieve: true },
  ]);
}

/**
 * Verus RPC Client
 *
 * Fetch-based JSON-RPC 1.0 client with automatic fallback endpoints.
 * Adapted from vtimestamp/src/lib/server/verus.ts
 */

import type { Network, IdentityHistoryResponse, BlockData } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const RPC_ENDPOINTS = {
  mainnet: {
    primary: 'https://api.verus.services',
    fallback: 'https://rpc.vrsc.syncproof.net',
  },
  testnet: {
    primary: 'https://api.verustest.net',
    fallback: null,
  },
} as const;

const RPC_TIMEOUT = 30_000;

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
  endpoint: string,
  method: string,
  params: unknown[] = []
): Promise<T> {
  const request = {
    jsonrpc: '1.0' as const,
    id: `vtimestamp-mcp-${Date.now()}`,
    method,
    params,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
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
 * Make an RPC call with automatic fallback on network errors.
 * RPC errors (like identity not found) are NOT retried on fallback.
 */
async function rpcCall<T>(
  network: Network,
  method: string,
  params: unknown[] = []
): Promise<T> {
  const endpoints = RPC_ENDPOINTS[network];

  try {
    return await rpcCallToEndpoint<T>(endpoints.primary, method, params);
  } catch (error) {
    if (error instanceof VerusRpcError) {
      throw error;
    }
    if (!endpoints.fallback) {
      throw error;
    }
    return await rpcCallToEndpoint<T>(endpoints.fallback, method, params);
  }
}

// ============================================================================
// RPC Methods
// ============================================================================

export async function getIdentityHistory(
  identity: string,
  network: Network
): Promise<IdentityHistoryResponse> {
  return rpcCall<IdentityHistoryResponse>(network, 'getidentityhistory', [identity]);
}

export async function getBlock(
  blockhash: string,
  network: Network
): Promise<BlockData> {
  return rpcCall<BlockData>(network, 'getblock', [blockhash]);
}

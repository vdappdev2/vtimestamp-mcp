/**
 * MCP Tool Registrations
 *
 * Registers vtimestamp_verify, vtimestamp_list, and vtimestamp_info tools.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVdxfKeys, findTimestampByHash, parseAllTimestamps, isValidIdentity } from './vdxf.js';
import { getIdentityHistory, getBlock, VerusRpcError, RPC_ERROR_CODES } from './verus-rpc.js';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function registerTools(server: McpServer): void {
  // ==========================================================================
  // vtimestamp_verify
  // ==========================================================================

  server.tool(
    'vtimestamp_verify',
    'Verify whether a file or text has been timestamped on a VerusID. Provide either a file_path or text — the server computes the SHA-256 hash and checks it against the on-chain record. Returns blockchain proof details if found.',
    {
      identity: z.string().describe('VerusID name (e.g., "alice@")'),
      file_path: z.string().optional().describe('Path to a file to verify. Mutually exclusive with text.'),
      text: z.string().optional().describe('Text string to verify. Mutually exclusive with file_path.'),
    },
    async ({ identity, file_path, text }) => {
      if (!isValidIdentity(identity)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid identity format — must be a VerusID name ending with @ (e.g., "alice@")'
        );
      }

      // Validate exactly one input mode
      if (!file_path && !text) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Must provide either file_path or text'
        );
      }
      if (file_path && text) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Only one of file_path or text may be provided — they are mutually exclusive'
        );
      }

      // Resolve hash from the provided input
      let hash: string;
      if (file_path) {
        try {
          const fileBuffer = await readFile(file_path);
          hash = sha256(fileBuffer);
        } catch (err) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      } else {
        hash = sha256(text!);
      }

      try {
        const keys = getVdxfKeys();
        const historyResponse = await getIdentityHistory(identity);
        const timestamp = findTimestampByHash(historyResponse.history, hash, keys);

        if (!timestamp) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    verified: false,
                    identity: historyResponse.fullyqualifiedname,
                    hash,
                    message: `No timestamp matching this hash was found on identity ${historyResponse.fullyqualifiedname}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        let blocktime: number | undefined;
        try {
          const block = await getBlock(timestamp.blockhash);
          blocktime = block.time;
        } catch {
          // Block time is optional
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  verified: true,
                  identity: historyResponse.fullyqualifiedname,
                  hash: timestamp.data.sha256,
                  title: timestamp.data.title,
                  description: timestamp.data.description ?? null,
                  filename: timestamp.data.filename ?? null,
                  filesize: timestamp.data.filesize ?? null,
                  block_height: timestamp.blockheight,
                  block_time: blocktime
                    ? new Date(blocktime * 1000).toISOString()
                    : null,
                  block_hash: timestamp.blockhash,
                  transaction_id: timestamp.txid,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof VerusRpcError && err.code === RPC_ERROR_CODES.IDENTITY_NOT_FOUND) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Identity '${identity}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        if (err instanceof McpError) throw err;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to verify timestamp: ${err instanceof Error ? err.message : 'Unknown error'}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==========================================================================
  // vtimestamp_list
  // ==========================================================================

  server.tool(
    'vtimestamp_list',
    'List all timestamps recorded on a VerusID. Returns an array of timestamps with hash, title, metadata, and blockchain proof details.',
    {
      identity: z.string().describe('VerusID name (e.g., "alice@")'),
    },
    async ({ identity }) => {
      if (!isValidIdentity(identity)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid identity format — must be a VerusID name ending with @ (e.g., "alice@")'
        );
      }

      try {
        const keys = getVdxfKeys();
        const historyResponse = await getIdentityHistory(identity);
        const timestamps = parseAllTimestamps(historyResponse.history, keys);

        // Fetch block times for all timestamps
        const results = await Promise.all(
          timestamps.map(async (ts) => {
            let blocktime: number | undefined;
            try {
              const block = await getBlock(ts.blockhash);
              blocktime = block.time;
            } catch {
              // Block time is optional
            }

            return {
              hash: ts.data.sha256,
              title: ts.data.title,
              description: ts.data.description ?? null,
              filename: ts.data.filename ?? null,
              filesize: ts.data.filesize ?? null,
              block_height: ts.blockheight,
              block_time: blocktime
                ? new Date(blocktime * 1000).toISOString()
                : null,
              transaction_id: ts.txid,
            };
          })
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  identity: historyResponse.fullyqualifiedname,
                  timestamp_count: results.length,
                  timestamps: results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof VerusRpcError && err.code === RPC_ERROR_CODES.IDENTITY_NOT_FOUND) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Identity '${identity}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to list timestamps: ${err instanceof Error ? err.message : 'Unknown error'}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==========================================================================
  // vtimestamp_info
  // ==========================================================================

  server.tool(
    'vtimestamp_info',
    'Get information about the vtimestamp service — what it is, how it works, and supported features.',
    {},
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                name: 'vtimestamp',
                description:
                  'Decentralized document timestamping on the Verus blockchain. Creates cryptographic proof that a document existed at a specific point in time. Documents never leave the user\'s device — only a SHA-256 hash is stored on-chain, tied to the user\'s VerusID (a self-sovereign blockchain identity). Anyone can verify a timestamp without an account.',
                website: 'https://vtimestamp.com',
                github: 'https://github.com/vdappdev2/vtimestamp',
                verification_url: 'https://vtimestamp.com/verify',
                features: [
                  'Privacy-first: only hash stored, document never uploaded',
                  'Self-sovereign: timestamps stored on user\'s own VerusID',
                  'Permissionless verification: anyone can verify, no account needed',
                  'Structured metadata: title, description, filename stored on-chain',
                  'Identity-bound: proof answers both \'when\' and \'who\'',
                  'Immutable: blockchain timestamp cannot be changed or backdated',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

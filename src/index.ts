#!/usr/bin/env node

/**
 * vtimestamp MCP Server
 *
 * Enables AI agents to verify and query vtimestamp proofs on the Verus blockchain.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'vtimestamp-mcp',
  version: '1.1.1',
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

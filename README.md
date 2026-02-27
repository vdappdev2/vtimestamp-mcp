# vtimestamp-mcp

MCP server for verifying and querying [vtimestamp](https://vtimestamp.com) proofs on the Verus blockchain.

Enables AI agents (Claude Desktop, VS Code, etc.) to verify document timestamps and list all timestamps on a VerusID — directly from the blockchain.

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "npx",
      "args": ["-y", "vtimestamp-mcp"]
    }
  }
}
```

Using yarn:

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "yarn",
      "args": ["dlx", "vtimestamp-mcp"]
    }
  }
}
```

Using pnpm:

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "pnpm",
      "args": ["dlx", "vtimestamp-mcp"]
    }
  }
}
```

### VS Code

Add to your VS Code MCP settings:

```json
{
  "mcp": {
    "servers": {
      "vtimestamp": {
        "command": "npx",
        "args": ["-y", "vtimestamp-mcp"]
      }
    }
  }
}
```

## Tools

### `vtimestamp_verify`

Verify whether a document hash has been timestamped on a VerusID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |
| `hash` | string | Yes | SHA-256 hash (64-character hex string) |
| `network` | string | No | `mainnet` (default) or `testnet` |

**Example:** "Can you check if my document has been timestamped? My VerusID is alice@ and the hash is a7f3b2c1..."

### `vtimestamp_list`

List all timestamps recorded on a VerusID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |
| `network` | string | No | `mainnet` (default) or `testnet` |

**Example:** "What documents has alice@ timestamped?"

### `vtimestamp_info`

Get information about the vtimestamp service.

No parameters.

**Example:** "What is vtimestamp?"

## How It Works

The server queries the public Verus RPC endpoints to read on-chain data. No wallet interaction, no API keys, no authentication required.

```
AI Agent (Claude Desktop, VS Code, etc.)
    │ stdio (JSON-RPC)
    ▼
vtimestamp-mcp (local)
    │ HTTPS (JSON-RPC 1.0)
    ▼
Verus Public RPC
    ├── mainnet: api.verus.services
    └── testnet: api.verustest.net
```

## Requirements

- Node.js 18+

## License

MIT

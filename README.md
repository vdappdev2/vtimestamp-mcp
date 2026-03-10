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

Verify whether a file or text has been timestamped on a VerusID. Provide either a file path or text — the server computes the SHA-256 hash and checks it against the on-chain record.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |
| `file_path` | string | One of | Path to a file to verify |
| `text` | string | One of | Text string to verify |

Either `file_path` or `text` must be provided (mutually exclusive).

**Example prompts:**
- "Check if the file at /path/to/report.pdf has been timestamped on alice@"
- "Verify this text was timestamped on bob@: I attest that invoice #4521 was approved"

### `vtimestamp_list`

List all timestamps recorded on a VerusID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |

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
Verus Public RPC (api.verus.services)
```

## Requirements

- Node.js 18+

## License

MIT

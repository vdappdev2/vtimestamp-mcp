# vtimestamp-mcp

MCP server for verifying and querying [vtimestamp](https://vtimestamp.com) proofs on the Verus blockchain.

Enables AI agents (Claude Desktop, VS Code, etc.) to verify document timestamps and list all timestamps on a VerusID — directly from the blockchain.

> **Looking for the write server?** See [vtimestamp-mcp-write](https://www.npmjs.com/package/vtimestamp-mcp-write) — needs a local daemon and a wallet with the identity's private key.

## Installation

### Claude Code

```bash
claude mcp add --transport stdio --scope user vtimestamp-read -- npx vtimestamp-mcp@latest
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "npx",
      "args": ["-y", "vtimestamp-mcp@latest"]
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
        "args": ["-y", "vtimestamp-mcp@latest"]
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

By default, the server queries a public Verus mainnet RPC endpoint. No wallet, no API keys, no authentication required.

```
AI Agent (Claude Desktop, VS Code, etc.)
    │ stdio (JSON-RPC)
    ▼
vtimestamp-mcp (local)
    │ HTTPS (JSON-RPC 1.0)
    ▼
Public Verus Mainnet RPC (rpc.vrsc.syncproof.net, fallback api.verus.services)
```

You can also point this server at your own daemon — useful for testnet (where no public RPC supports decryption), high-volume agents, custom chains, or anyone who'd rather not have their inspections hit a public RPC. See [Configuration](#configuration) below.

## On-chain storage shape

vtimestamps are stored under a VerusID's `contentmultimap` and read via `getidentityhistory` (one history entry per `updateidentity`). This server handles two on-chain shapes transparently:

- **Public-encrypted (`flags: 13`, written by `vtimestamp-mcp-write@1.2.0+`)** — the daemon's `{data:{}}` envelope produces a single ciphertext DataDescriptor with `epk` and `ivk` published on-chain. Reading these requires `decryptdata` + the originating txid + `retrieve: true`. Because the IVK is on-chain (public-encrypted mode), anyone can decrypt — no key sharing.
- **Legacy plaintext (`flags: 0`, written by `vtimestamp-mcp-write@1.1.x` and earlier)** — per-field DataDescriptors (sha256, title, description, filename, filesize) under labeled keys. Read directly without `decryptdata`.

The reader branches on each entry's flags. Mixed identities (legacy entries from older writes alongside new encrypted entries) are handled correctly — both surface in `vtimestamp_list` output.

**For background, see** [How to Publish Encrypted Data on an Identity](https://github.com/vdappdev2/verus-pbaas-docs/blob/main/docs/how-to/data/publish-encrypted-data-on-identity.md).

### Public RPC requirement

`decryptdata` is a daemon RPC method that public Verus RPCs do not all whitelist. As of writing:

| Endpoint | Chain | `decryptdata` | Notes |
|---|---|---|---|
| `https://rpc.vrsc.syncproof.net` | VRSC mainnet | ✅ enabled | This server's primary endpoint. |
| `https://api.verus.services` | VRSC mainnet | ❌ disabled | Fallback only. Encrypted entries fail to decrypt here, but legacy plaintext reads still work. |
| `https://api.verustest.net` | VRSCTEST | ❌ disabled | No public testnet RPC supports `decryptdata`. **Testnet encrypted reads require a local daemon.** |

If syncproof is unreachable and the call falls back to `api.verus.services`, encrypted entries will gracefully surface as un-decryptable rather than crashing.

## Configuration

For default public-RPC use, **no configuration is needed**. To point the server at your own daemon (required for testnet, recommended for high-volume use), set environment variables.

### Environment Variables

All optional. Setting any of these switches the server from public-RPC mode to local-daemon mode.

| Variable | Description |
|----------|-------------|
| `VERUS_RPC_URL` | Daemon RPC URL (e.g., `http://127.0.0.1:27486` for mainnet, `http://127.0.0.1:18843` for testnet) |
| `VERUS_CONF_PATH` | Path to a `VRSC.conf` / `vrsctest.conf` file. Auto-derives URL (`http://127.0.0.1:<rpcport>`) and credentials. |
| `VERUS_RPC_USER` | Override: RPC username |
| `VERUS_RPC_PASSWORD` | Override: RPC password |

**Behavior:**

- *(no env vars)* → public RPC pair (`rpc.vrsc.syncproof.net` primary, `api.verus.services` fallback). Mainnet only.
- `VERUS_RPC_URL` set → single local endpoint at that URL. Auth from `VERUS_RPC_USER` + `VERUS_RPC_PASSWORD`, or auto-derived from `VERUS_CONF_PATH` if those are missing.
- `VERUS_CONF_PATH` set (without `VERUS_RPC_URL`) → URL = `http://127.0.0.1:<rpcport>` from the conf, with credentials from the conf.

### Local daemon example (testnet)

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "npx",
      "args": ["-y", "vtimestamp-mcp@latest"],
      "env": {
        "VERUS_CONF_PATH": "/Users/you/Library/Application Support/Komodo/vrsctest/vrsctest.conf"
      }
    }
  }
}
```

Or pin everything explicitly:

```json
{
  "mcpServers": {
    "vtimestamp": {
      "command": "npx",
      "args": ["-y", "vtimestamp-mcp@latest"],
      "env": {
        "VERUS_RPC_URL": "http://127.0.0.1:18843",
        "VERUS_RPC_USER": "rpc-user-from-conf",
        "VERUS_RPC_PASSWORD": "rpc-password-from-conf"
      }
    }
  }
}
```

## Requirements

- Node.js 18+
- For default operation: nothing else — uses public mainnet RPC.
- For testnet or local-daemon mode: a running `verusd` (or `verusd -chain=vrsctest`) on the host you point at.

## License

MIT

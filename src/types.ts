/**
 * TypeScript interfaces for vtimestamp-mcp
 */

// ============================================================================
// Verus RPC Types
// ============================================================================

export interface DataDescriptor {
  version: number;
  flags: number;
  // On-chain encrypted descriptors (flags:13/5/37) carry ciphertext as a hex string.
  // Legacy plaintext descriptors (flags:0) carry { message: string } or a raw number.
  objectdata: { message: string } | number | string | null;
  label?: string;
  mimetype?: string;
  // Encryption fields, present when flags has the relevant bits set.
  epk?: string;
  ivk?: string;
  salt?: string;
}

export interface DataDescriptorWrapper {
  [wrapperKey: string]: DataDescriptor;
}

export interface ContentMultiMap {
  [outerKey: string]: DataDescriptorWrapper[];
}

/**
 * The decrypted form of a flags:13 entry, returned by `decryptdata` with
 * `retrieve: true`. Plaintext bytes live as hex in `objectdata`.
 */
export interface DecryptedDataDescriptor {
  version: number;
  flags: number;
  objectdata: string;
  salt?: string;
}

export interface IdentityData {
  version: number;
  flags: number;
  name: string;
  identityaddress: string;
  parent: string;
  contentmultimap?: ContentMultiMap;
}

export interface IdentityHistoryEntry {
  identity: IdentityData;
  blockhash: string;
  height: number;
  output: {
    txid: string;
    voutnum: number;
  };
}

export interface IdentityHistoryResponse {
  fullyqualifiedname: string;
  status: string;
  history: IdentityHistoryEntry[];
}

export interface BlockData {
  hash: string;
  height: number;
  time: number;
}

// ============================================================================
// vtimestamp Types
// ============================================================================

export interface TimestampData {
  sha256: string;
  title: string;
  description?: string;
  filename?: string;
  filesize?: number;
}

export interface TimestampRecord {
  data: TimestampData;
  blockhash: string;
  blockheight: number;
  blocktime?: number;
  txid: string;
}

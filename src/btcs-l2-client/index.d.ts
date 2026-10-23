export interface NetworkProfile {
  readonly id: string
  readonly profileType: 'local-development'
  readonly chainId: string
  readonly clientVersionPrefix: string
}

export declare const BTCS_L2_LOCAL: Readonly<NetworkProfile>
export declare const NETWORK_IDENTITY_SCHEMA_VERSION: 1

export interface NetworkIdentity {
  readonly schemaVersion: 1
  readonly profileType: 'local-development'
  readonly profileId: 'btcs-l2-local'
  readonly chainId: '31337'
  readonly clientVersion: string
}

export interface RpcTransaction {
  readonly hash: string
  readonly blockHash: string | null
  readonly blockNumber: string | null
  readonly [field: string]: unknown
}

export interface RpcBlock {
  readonly hash: string
  readonly parentHash: string
  readonly number: string
  readonly transactions: readonly (string | RpcTransaction)[]
  readonly [field: string]: unknown
}

export interface RpcReceipt {
  readonly transactionHash: string
  readonly blockHash: string
  readonly blockNumber: string
  readonly status: '0x0' | '0x1'
  readonly [field: string]: unknown
}

export type TransactionStatus =
  | { readonly status: 'missing' }
  | { readonly status: 'pending' }
  | { readonly status: 'confirmed' | 'reverted'; readonly blockHash: string; readonly blockNumber: bigint }

export class BtcsL2ClientError extends Error {}
export class RpcTransportError extends BtcsL2ClientError {
  readonly status?: number
}
export class RpcProtocolError extends BtcsL2ClientError {}
export class JsonRpcError extends BtcsL2ClientError {
  readonly code: number
  readonly data: unknown
}
export class NetworkMismatchError extends BtcsL2ClientError {}
export class UnsupportedNetworkProfileError extends BtcsL2ClientError {}
export class UnsupportedNetworkIdentitySchemaError extends BtcsL2ClientError {
  readonly schemaVersion: unknown
}
export class NetworkIdentityValidationError extends BtcsL2ClientError {}

export interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

export type FetchImplementation = (
  url: string,
  init: {
    method: 'POST'
    headers: Record<string, string>
    body: string
    signal: AbortSignal
  },
) => Promise<FetchResponse>

export interface CreateBtcsL2ClientOptions {
  readonly endpoint: string
  readonly profile: NetworkProfile
  readonly timeoutMs?: number
  readonly fetchImpl?: FetchImplementation
}

export interface BtcsL2Client {
  readonly endpoint: string
  readonly profile: Readonly<NetworkProfile>
  getClientVersion(): Promise<string>
  getChainId(): Promise<bigint>
  getNetworkVersion(): Promise<string>
  isListening(): Promise<boolean>
  verifyNetwork(): Promise<NetworkIdentity>
  getBlockNumber(): Promise<bigint>
  getBlock(reference?: 'latest' | 'earliest' | bigint, fullTransactions?: boolean): Promise<RpcBlock | null>
  getTransaction(hash: string): Promise<RpcTransaction | null>
  getTransactionReceipt(hash: string): Promise<RpcReceipt | null>
  getTransactionStatus(hash: string): Promise<TransactionStatus>
  getBalance(address: string, reference?: 'latest' | 'earliest' | bigint): Promise<bigint>
  getTransactionCount(address: string, reference?: 'latest' | 'earliest' | bigint): Promise<bigint>
  getCode(address: string, reference?: 'latest' | 'earliest' | bigint): Promise<string>
}

export declare function createBtcsL2Client(
  options: CreateBtcsL2ClientOptions,
): BtcsL2Client

export declare function validateNetworkIdentity(value: unknown): NetworkIdentity

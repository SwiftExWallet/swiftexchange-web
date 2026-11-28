import { Contract, Networks, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { Interface } from 'ethers';

import { getStellarConfig } from '../modules/walletconnect/config/chains';
import { CCTP_SUPPORTED_EVM_CHAINS, type CctpEvmChainConfig } from './evmToStellarCctpService';

export const CCTP_STELLAR_DOMAIN = 27;

export const CCTP_EVM_DOMAINS: Record<string, number> = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
};

export const CCTP_MESSAGE_TRANSMITTER_V2: Record<'mainnet' | 'testnet', string> = {
  mainnet: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  testnet: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
};

export const CCTP_STELLAR_MESSAGE_TRANSMITTER: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV',
  testnet: 'CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY',
};

export const CCTP_STELLAR_FORWARDER: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
  testnet: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
};

export interface CctpBurnHistoryEntry {
  txHash: string;
  sourceKind: 'EVM' | 'STELLAR';
  sourceChainId?: number;
  evmAddress?: string;
  stellarAddress?: string;
  amount?: string;
  transferId?: string;
  claimed?: boolean;
  createdAt: number;
}

const BURN_HISTORY_STORAGE_PREFIX = 'swiftex_cctp_burn_history_';
const MAX_BURN_HISTORY_ITEMS = 25;

export function getCctpBurnHistory(network: 'mainnet' | 'testnet'): CctpBurnHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${BURN_HISTORY_STORAGE_PREFIX}${network}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCctpBurnHistory(
  network: 'mainnet' | 'testnet',
  entry: Omit<CctpBurnHistoryEntry, 'createdAt'> & { createdAt?: number }
): void {
  try {
    const normalized = normalizeBurnTxHash(entry.txHash, entry.sourceKind);
    if (!normalized) return;
    const existing = getCctpBurnHistory(network);
    const filtered = existing.filter(
      item => normalizeBurnTxHash(item.txHash, item.sourceKind) !== normalized
    );
    const next: CctpBurnHistoryEntry[] = [
      {
        ...entry,
        txHash: normalized,
        createdAt: entry.createdAt ?? Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_BURN_HISTORY_ITEMS);
    localStorage.setItem(`${BURN_HISTORY_STORAGE_PREFIX}${network}`, JSON.stringify(next));
  } catch {
    void 0;
  }
}

export function markCctpBurnClaimed(
  network: 'mainnet' | 'testnet',
  txHash: string,
  sourceKind: 'EVM' | 'STELLAR'
): void {
  try {
    const normalized = normalizeBurnTxHash(txHash, sourceKind);
    const existing = getCctpBurnHistory(network);
    const updated = existing.map(item =>
      normalizeBurnTxHash(item.txHash, item.sourceKind) === normalized
        ? { ...item, claimed: true }
        : item
    );
    localStorage.setItem(`${BURN_HISTORY_STORAGE_PREFIX}${network}`, JSON.stringify(updated));
  } catch {
    void 0;
  }
}

export const CCTP_IRIS_API_BASE: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'https://iris-api.circle.com',
  testnet: 'https://iris-api-sandbox.circle.com',
};

const MESSAGE_TRANSMITTER_ABI = [
  'function usedNonces(bytes32 nonce) view returns (uint256)',
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
];

const messageTransmitterInterface = new Interface(MESSAGE_TRANSMITTER_ABI);

export type CctpRecoveryPhase =
  | 'IDLE'
  | 'CHECKING'
  | 'BURN_NOT_FOUND'
  | 'BURN_FAILED'
  | 'ATTESTATION_PENDING'
  | 'ALREADY_CLAIMED'
  | 'EXPIRED_NEEDS_REATTEST'
  | 'REATTESTING'
  | 'CLAIMABLE_EVM'
  | 'CLAIMABLE_STELLAR'
  | 'CLAIMING'
  | 'CLAIMED'
  | 'ERROR';

export interface CctpRecoveryState {
  phase: CctpRecoveryPhase;
  txHash: string;
  sourceKind: 'EVM' | 'STELLAR';
  sourceDomain: number;
  sourceChainId?: number;
  sourceChainName?: string;
  transferId?: string;
  destinationDomain?: number;
  destinationChainId?: number;
  destinationChainName?: string;
  destinationRpcUrl?: string;
  destinationExplorerUrl?: string;
  message?: string;
  attestation?: string;
  nonce?: string;
  expirationBlock?: string;
  mintRecipient?: string;
  amountUsdc?: string;
  mintTxHash?: string;
  humanMessage: string;
  error?: string | null;
}

export function getCctpDomainForEvmChain(
  chainId: number,
  network: 'mainnet' | 'testnet'
): number | null {
  const chain = CCTP_SUPPORTED_EVM_CHAINS.find(c => c[network].chainId === Number(chainId));
  if (!chain) return null;
  return CCTP_EVM_DOMAINS[chain.id] ?? null;
}

export function getEvmChainByCctpDomain(domain: number): CctpEvmChainConfig | null {
  const entry = Object.entries(CCTP_EVM_DOMAINS).find(([, d]) => d === domain);
  if (!entry) return null;
  const [chainIdKey] = entry;
  return CCTP_SUPPORTED_EVM_CHAINS.find(c => c.id === chainIdKey) ?? null;
}

export function normalizeBurnTxHash(txHash: string, sourceKind: 'EVM' | 'STELLAR'): string {
  const trimmed = txHash.trim();
  if (sourceKind === 'EVM') {
    return '0x' + trimmed.replace(/^(0x)+/i, '').toLowerCase();
  }
  return trimmed.replace(/^(0x)+/i, '');
}

async function evmJsonRpcCall<T = any>(
  rpcUrl: string,
  method: string,
  params: any[],
  signal?: AbortSignal
): Promise<T> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  });
  if (!resp.ok) {
    throw new Error(`RPC request failed (${resp.status})`);
  }
  const json = await resp.json();
  if (json?.error) {
    throw new Error(json.error.message || 'RPC returned an error');
  }
  return json?.result as T;
}

export async function verifyCctpBurnTx(params: {
  network: 'mainnet' | 'testnet';
  sourceKind: 'EVM' | 'STELLAR';
  evmChainId?: number;
  txHash: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; status: 'CONFIRMED' | 'FAILED' | 'NOT_FOUND'; reason?: string }> {
  const { network, sourceKind, evmChainId, txHash, signal } = params;
  const normalized = normalizeBurnTxHash(txHash, sourceKind);

  if (sourceKind === 'EVM') {
    const chain = CCTP_SUPPORTED_EVM_CHAINS.find(c => c[network].chainId === Number(evmChainId));
    if (!chain) {
      return { ok: false, status: 'NOT_FOUND', reason: 'Unsupported EVM source chain.' };
    }
    const receipt = await evmJsonRpcCall<any>(
      chain[network].rpcUrl,
      'eth_getTransactionReceipt',
      [normalized],
      signal
    );
    if (!receipt) {
      return {
        ok: false,
        status: 'NOT_FOUND',
        reason: 'Burn transaction not found or still pending on source EVM chain.',
      };
    }
    const succeeded = receipt.status === '0x1' || receipt.status === 1 || receipt.status === true;
    if (!succeeded) {
      return {
        ok: false,
        status: 'FAILED',
        reason: 'Burn transaction reverted on source EVM chain. Nothing to claim.',
      };
    }
    return { ok: true, status: 'CONFIRMED' };
  }

  // Stellar burn verification via Horizon
  const stellarConfig = getStellarConfig(network);
  const horizonBase = (
    stellarConfig?.horizonUrl ||
    (network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org')
  ).replace(/\/+$/, '');

  const resp = await fetch(`${horizonBase}/transactions/${encodeURIComponent(normalized)}`, {
    signal,
  });
  if (resp.status === 404) {
    return {
      ok: false,
      status: 'NOT_FOUND',
      reason: 'Stellar burn transaction not found on Horizon.',
    };
  }
  if (!resp.ok) {
    throw new Error(`Stellar Horizon error (${resp.status})`);
  }
  const tx = await resp.json();
  if (tx?.successful !== true) {
    return {
      ok: false,
      status: 'FAILED',
      reason: 'Stellar burn transaction failed on-chain. Nothing to claim.',
    };
  }
  return { ok: true, status: 'CONFIRMED' };
}

export interface IrisMessageResult {
  status: 'NOT_FOUND' | 'PENDING' | 'COMPLETE';
  message?: string;
  attestation?: string;
  nonce?: string;
  expirationBlock?: string;
  destinationDomain?: number;
  mintRecipient?: string;
  amountUsdc?: string;
  forwardState?: string;
  forwardTxHash?: string;
}

export async function fetchIrisMessage(params: {
  network: 'mainnet' | 'testnet';
  sourceDomain: number;
  txHash: string;
  sourceKind: 'EVM' | 'STELLAR';
  signal?: AbortSignal;
}): Promise<IrisMessageResult> {
  const { network, sourceDomain, txHash, sourceKind, signal } = params;
  const normalized = normalizeBurnTxHash(txHash, sourceKind);
  const base = CCTP_IRIS_API_BASE[network];

  const resp = await fetch(
    `${base}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(normalized)}`,
    { signal }
  );

  if (resp.status === 404) {
    return { status: 'NOT_FOUND' };
  }
  if (!resp.ok) {
    throw new Error(`Circle Iris API error (${resp.status})`);
  }

  const data = await resp.json();
  const msgEntry = Array.isArray(data?.messages) ? data.messages[0] : data;
  if (!msgEntry || msgEntry.status !== 'complete' || !msgEntry.attestation || !msgEntry.message) {
    return { status: 'PENDING' };
  }

  const decoded = msgEntry.decodedMessage || {};
  const rawAmount = decoded.decodedMessageBody?.amount ?? decoded.amount;
  const amountUsdc =
    rawAmount !== undefined && rawAmount !== null && !Number.isNaN(Number(rawAmount))
      ? (Number(rawAmount) / 1_000_000).toFixed(2)
      : undefined;

  return {
    status: 'COMPLETE',
    message: msgEntry.message,
    attestation: msgEntry.attestation,
    nonce: decoded.nonce ?? msgEntry.eventNonce,
    expirationBlock:
      decoded.expirationBlock !== undefined && decoded.expirationBlock !== null
        ? String(decoded.expirationBlock)
        : undefined,
    destinationDomain:
      decoded.destinationDomain !== undefined ? Number(decoded.destinationDomain) : undefined,
    mintRecipient: decoded.decodedMessageBody?.mintRecipient ?? decoded.mintRecipient,
    amountUsdc,
    forwardState: msgEntry.forwardState,
    forwardTxHash: msgEntry.forwardTxHash,
  };
}

export async function isEvmNonceUsed(params: {
  network: 'mainnet' | 'testnet';
  rpcUrl: string;
  nonce: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { network, rpcUrl, nonce, signal } = params;
  const normalizedNonce = '0x' + nonce.replace(/^0x/i, '').padStart(64, '0');
  const calldata = messageTransmitterInterface.encodeFunctionData('usedNonces', [normalizedNonce]);
  const rawResult = await evmJsonRpcCall<string>(
    rpcUrl,
    'eth_call',
    [{ to: CCTP_MESSAGE_TRANSMITTER_V2[network], data: calldata }, 'latest'],
    signal
  );
  const decoded = messageTransmitterInterface.decodeFunctionResult('usedNonces', rawResult);
  return BigInt(decoded[0]) !== 0n;
}

export async function isAttestationExpired(params: {
  rpcUrl: string;
  expirationBlock?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { rpcUrl, expirationBlock, signal } = params;
  if (!expirationBlock) return false;
  try {
    const exp = BigInt(expirationBlock);
    if (exp <= 0n) return false;
    const blockHex = await evmJsonRpcCall<string>(rpcUrl, 'eth_blockNumber', [], signal);
    const currentBlock = BigInt(blockHex);
    return currentBlock >= exp;
  } catch {
    return false;
  }
}

export async function requestIrisReattestation(params: {
  network: 'mainnet' | 'testnet';
  nonce: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; error?: string }> {
  const { network, nonce, signal } = params;
  const normalizedNonce = '0x' + nonce.replace(/^0x/i, '').padStart(64, '0');
  const base = CCTP_IRIS_API_BASE[network];
  const resp = await fetch(`${base}/v2/reattest/${encodeURIComponent(normalizedNonce)}`, {
    method: 'POST',
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return {
      ok: false,
      error: text || `Re-attestation request failed (${resp.status})`,
    };
  }
  return { ok: true };
}

export function buildReceiveMessageTx(params: {
  network: 'mainnet' | 'testnet';
  message: string;
  attestation: string;
}): { to: string; data: string } {
  const { network, message, attestation } = params;
  const data = messageTransmitterInterface.encodeFunctionData('receiveMessage', [
    message,
    attestation,
  ]);
  return {
    to: CCTP_MESSAGE_TRANSMITTER_V2[network],
    data,
  };
}

export async function buildStellarReceiveMessageXdr(params: {
  network: 'mainnet' | 'testnet';
  callerAddress: string;
  message: string;
  attestation: string;
}): Promise<string> {
  const { network, callerAddress, message, attestation } = params;
  const stellarCfg = getStellarConfig(network);
  const rpcUrl =
    network === 'testnet'
      ? 'https://soroban-testnet.stellar.org'
      : 'https://mainnet.sorobanrpc.com';
  const networkPassphrase =
    stellarCfg?.networkPassphrase || (network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC);

  const server = new rpc.Server(rpcUrl);
  const account = await server.getAccount(callerAddress);
  const msgBytes = Buffer.from(message.replace(/^0x/i, ''), 'hex');
  const attBytes = Buffer.from(attestation.replace(/^0x/i, ''), 'hex');

  const tryPrepare = async (contractId: string, method: string): Promise<string> => {
    const tx = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase,
    })
      .addOperation(
        new Contract(contractId).call(
          method,
          nativeToScVal(msgBytes, { type: 'bytes' }),
          nativeToScVal(attBytes, { type: 'bytes' })
        )
      )
      .setTimeout(120)
      .build();

    const prepared = await server.prepareTransaction(tx);
    return prepared.toXDR();
  };

  // Inbound EVM -> Stellar transfers routed via CctpForwarder must call mint_and_forward(message, attestation).
  // Fall back to MessageTransmitter.receive_message(message, attestation) for direct (non-forwarder) transfers.
  try {
    return await tryPrepare(CCTP_STELLAR_FORWARDER[network], 'mint_and_forward');
  } catch (forwarderErr: any) {
    const errText = String(forwarderErr?.message || forwarderErr || '');
    if (/nonce.*used|already.*used|already.*claimed/i.test(errText)) {
      throw forwarderErr;
    }
    return await tryPrepare(CCTP_STELLAR_MESSAGE_TRANSMITTER[network], 'receive_message');
  }
}

export async function inspectCctpRecovery(params: {
  network: 'mainnet' | 'testnet';
  sourceKind: 'EVM' | 'STELLAR';
  evmChainId?: number;
  txHash: string;
  knownDestinationTxHash?: string | null;
  signal?: AbortSignal;
}): Promise<CctpRecoveryState> {
  const { network, sourceKind, evmChainId, txHash, knownDestinationTxHash, signal } = params;
  const normalizedHash = normalizeBurnTxHash(txHash, sourceKind);

  const sourceDomain =
    sourceKind === 'STELLAR'
      ? CCTP_STELLAR_DOMAIN
      : getCctpDomainForEvmChain(evmChainId || 0, network);

  if (sourceDomain === null) {
    return {
      phase: 'ERROR',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain: -1,
      sourceChainId: evmChainId,
      humanMessage: 'Unsupported source chain for CCTP recovery.',
      error: 'Unsupported source chain.',
    };
  }

  // Gate 1: Verify burn succeeded on-chain
  const burnCheck = await verifyCctpBurnTx({
    network,
    sourceKind,
    evmChainId,
    txHash: normalizedHash,
    signal,
  });

  if (!burnCheck.ok) {
    return {
      phase: burnCheck.status === 'FAILED' ? 'BURN_FAILED' : 'BURN_NOT_FOUND',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      humanMessage: burnCheck.reason || 'Burn verification failed.',
    };
  }

  // Gate 2: Check Circle Iris v2 attestation
  const iris = await fetchIrisMessage({
    network,
    sourceDomain,
    txHash: normalizedHash,
    sourceKind,
    signal,
  });

  if (iris.status === 'NOT_FOUND' || iris.status === 'PENDING') {
    return {
      phase: 'ATTESTATION_PENDING',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      humanMessage:
        'Burn confirmed, but Circle attestation is still pending. Wait a moment and check again.',
    };
  }

  const sourceEvmChain =
    sourceKind === 'EVM' && evmChainId
      ? CCTP_SUPPORTED_EVM_CHAINS.find(c => c[network].chainId === Number(evmChainId))?.[network]
          ?.displayName
      : 'Stellar';

  // If Circle Forwarding already completed this transfer, it is already claimed
  if (iris.forwardTxHash || iris.forwardState === 'COMPLETE' || iris.forwardState === 'CONFIRMED') {
    return {
      phase: 'ALREADY_CLAIMED',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      sourceChainName: sourceEvmChain,
      destinationDomain: iris.destinationDomain,
      mintTxHash: iris.forwardTxHash,
      amountUsdc: iris.amountUsdc,
      humanMessage: 'This transfer has already been forwarded and minted.',
    };
  }

  // Determine destination chain details
  const destDomain = iris.destinationDomain;
  if (destDomain === CCTP_STELLAR_DOMAIN) {
    if (knownDestinationTxHash) {
      return {
        phase: 'ALREADY_CLAIMED',
        txHash: normalizedHash,
        sourceKind,
        sourceDomain,
        sourceChainId: evmChainId,
        sourceChainName: sourceEvmChain,
        destinationDomain: destDomain,
        destinationChainName: 'Stellar',
        mintTxHash: knownDestinationTxHash,
        amountUsdc: iris.amountUsdc,
        humanMessage: 'This transfer has already been minted on Stellar.',
      };
    }
    return {
      phase: 'CLAIMABLE_STELLAR',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      sourceChainName: sourceEvmChain,
      destinationDomain: destDomain,
      destinationChainName: 'Stellar',
      message: iris.message,
      attestation: iris.attestation,
      nonce: iris.nonce,
      expirationBlock: iris.expirationBlock,
      mintRecipient: iris.mintRecipient,
      amountUsdc: iris.amountUsdc,
      humanMessage: `Burn verified & unminted. Ready to claim${iris.amountUsdc ? ` ${iris.amountUsdc} USDC` : ''} on Stellar.`,
    };
  }

  const destEvmChain = destDomain !== undefined ? getEvmChainByCctpDomain(destDomain) : null;
  if (!destEvmChain) {
    return {
      phase: 'ERROR',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      destinationDomain: destDomain,
      humanMessage: `Unsupported destination CCTP domain (${destDomain ?? 'unknown'}).`,
      error: 'Unsupported destination domain.',
    };
  }

  const destNetCfg = destEvmChain[network];

  // Gate 3: Verify nonce has NOT already been used on destination EVM MessageTransmitterV2
  if (iris.nonce) {
    const alreadyUsed = await isEvmNonceUsed({
      network,
      rpcUrl: destNetCfg.rpcUrl,
      nonce: iris.nonce,
      signal,
    });
    if (alreadyUsed) {
      return {
        phase: 'ALREADY_CLAIMED',
        txHash: normalizedHash,
        sourceKind,
        sourceDomain,
        sourceChainId: evmChainId,
        destinationDomain: destDomain,
        destinationChainId: destNetCfg.chainId,
        destinationChainName: destNetCfg.displayName,
        destinationRpcUrl: destNetCfg.rpcUrl,
        destinationExplorerUrl: destNetCfg.explorerUrl,
        nonce: iris.nonce,
        mintRecipient: iris.mintRecipient,
        amountUsdc: iris.amountUsdc,
        humanMessage: `Already claimed/minted on ${destNetCfg.displayName}. Nothing to claim.`,
      };
    }
  }

  // Gate 4: Check if attestation expired (~24h) and needs POST /v2/reattest/{nonce}
  const expired = await isAttestationExpired({
    rpcUrl: destNetCfg.rpcUrl,
    expirationBlock: iris.expirationBlock,
    signal,
  });

  if (expired && iris.nonce) {
    return {
      phase: 'EXPIRED_NEEDS_REATTEST',
      txHash: normalizedHash,
      sourceKind,
      sourceDomain,
      sourceChainId: evmChainId,
      destinationDomain: destDomain,
      destinationChainId: destNetCfg.chainId,
      destinationChainName: destNetCfg.displayName,
      destinationRpcUrl: destNetCfg.rpcUrl,
      destinationExplorerUrl: destNetCfg.explorerUrl,
      message: iris.message,
      attestation: iris.attestation,
      nonce: iris.nonce,
      expirationBlock: iris.expirationBlock,
      mintRecipient: iris.mintRecipient,
      amountUsdc: iris.amountUsdc,
      humanMessage: `Attestation expired on ${destNetCfg.displayName}. Request a fresh attestation and claim.`,
    };
  }

  // Gate 5: Ready to claim on EVM!
  return {
    phase: 'CLAIMABLE_EVM',
    txHash: normalizedHash,
    sourceKind,
    sourceDomain,
    sourceChainId: evmChainId,
    destinationDomain: destDomain,
    destinationChainId: destNetCfg.chainId,
    destinationChainName: destNetCfg.displayName,
    destinationRpcUrl: destNetCfg.rpcUrl,
    destinationExplorerUrl: destNetCfg.explorerUrl,
    message: iris.message,
    attestation: iris.attestation,
    nonce: iris.nonce,
    expirationBlock: iris.expirationBlock,
    mintRecipient: iris.mintRecipient,
    amountUsdc: iris.amountUsdc,
    humanMessage: `Burn verified & unminted. Ready to claim${iris.amountUsdc ? ` ${iris.amountUsdc} USDC` : ''} on ${destNetCfg.displayName}.`,
  };
}

async function fetchRecentStellarTxHashes(
  network: 'mainnet' | 'testnet',
  stellarAddress: string,
  limit = 15,
  signal?: AbortSignal
): Promise<string[]> {
  try {
    const stellarConfig = getStellarConfig(network);
    const horizonBase = (
      stellarConfig?.horizonUrl ||
      (network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org')
    ).replace(/\/+$/, '');
    const resp = await fetch(
      `${horizonBase}/accounts/${encodeURIComponent(stellarAddress)}/transactions?order=desc&limit=${limit}`,
      { signal }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    const records: any[] = data?._embedded?.records || [];
    return records
      .filter(r => r?.successful === true && typeof r?.hash === 'string')
      .map(r => r.hash as string);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return [];
  }
}

/**
 * Automatically discovers unclaimed CCTP burns for the connected wallet(s)
 * from both local burn history and recent on-chain Stellar transactions.
 * Only returns transfers that are genuinely unminted (or pending/expired from local history).
 */
export async function discoverUnclaimedCctpBurns(params: {
  network: 'mainnet' | 'testnet';
  stellarAddress?: string;
  evmAddress?: string;
  signal?: AbortSignal;
}): Promise<CctpRecoveryState[]> {
  const { network, stellarAddress, evmAddress, signal } = params;
  if (!stellarAddress && !evmAddress) return [];

  const localEntries = getCctpBurnHistory(network).filter(entry => {
    if (entry.claimed) return false;
    const evmMatch =
      evmAddress && entry.evmAddress && entry.evmAddress.toLowerCase() === evmAddress.toLowerCase();
    const stellarMatch =
      stellarAddress && entry.stellarAddress && entry.stellarAddress === stellarAddress;
    return Boolean(evmMatch || stellarMatch);
  });

  const localHashSet = new Set(localEntries.map(e => normalizeBurnTxHash(e.txHash, e.sourceKind)));

  const horizonHashes = stellarAddress
    ? await fetchRecentStellarTxHashes(network, stellarAddress, 15, signal)
    : [];

  const candidates: Array<{
    txHash: string;
    sourceKind: 'EVM' | 'STELLAR';
    sourceChainId?: number;
    transferId?: string;
    fromLocal: boolean;
  }> = [
    ...localEntries.map(e => ({
      txHash: e.txHash,
      sourceKind: e.sourceKind,
      sourceChainId: e.sourceChainId,
      transferId: e.transferId,
      fromLocal: true,
    })),
    ...horizonHashes
      .filter(h => !localHashSet.has(normalizeBurnTxHash(h, 'STELLAR')))
      .map(h => ({
        txHash: h,
        sourceKind: 'STELLAR' as const,
        transferId: undefined,
        fromLocal: false,
      })),
  ];

  if (candidates.length === 0) return [];

  const results: CctpRecoveryState[] = [];
  const batchSize = 4;

  for (let i = 0; i < candidates.length; i += batchSize) {
    if (signal?.aborted) break;
    const batch = candidates.slice(i, i + batchSize);
    const inspected = await Promise.all(
      batch.map(async c => {
        try {
          const state = await inspectCctpRecovery({
            network,
            sourceKind: c.sourceKind,
            evmChainId: c.sourceChainId,
            txHash: c.txHash,
            signal,
          });
          if (state.phase === 'ALREADY_CLAIMED') {
            markCctpBurnClaimed(network, c.txHash, c.sourceKind);
            return null;
          }
          if (
            state.phase === 'CLAIMABLE_EVM' ||
            state.phase === 'EXPIRED_NEEDS_REATTEST' ||
            state.phase === 'CLAIMABLE_STELLAR' ||
            (c.fromLocal && state.phase === 'ATTESTATION_PENDING')
          ) {
            return c.transferId ? { ...state, transferId: c.transferId } : state;
          }
          return null;
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err;
          return null;
        }
      })
    );
    for (const item of inspected) {
      if (item) results.push(item);
    }
  }

  return results;
}

import { getCurrentNetwork } from '../../../service/apiConfig';

export class StellarSequenceTracker {
  private static lastSequences = new Map<string, string>();
  private static knownSequences = new Set<string>();

  private static makeKey(address: string, network?: string): string {
    const net = (network || getCurrentNetwork() || 'testnet').toLowerCase();
    return `${net}:${address.trim()}`;
  }

  /**
   * Gets the next sequence number to build a transaction.
   * If a tracked sequence is already greater than or equal to the ledger's sequence,
   * we increment the tracked sequence. Otherwise, we sync with the ledger sequence.
   */
  static getAndIncrementSequence(
    address: string,
    networkSequence: string,
    network?: string
  ): string {
    const key = this.makeKey(address, network);
    const trackedSeq = this.lastSequences.get(key);
    let nextSeq: bigint;

    if (trackedSeq && BigInt(trackedSeq) >= BigInt(networkSequence)) {
      nextSeq = BigInt(trackedSeq) + 1n;
    } else {
      nextSeq = BigInt(networkSequence);
    }

    this.lastSequences.set(key, nextSeq.toString());

    // Track the transaction sequence number we built (seqNum = baseSeq + 1)
    const txSeq = (nextSeq + 1n).toString();
    this.knownSequences.add(`${key}:${txSeq}`);

    return nextSeq.toString();
  }

  /**
   * Checks if a sequence number was built by the tracker.
   */
  static isKnownSequence(address: string, txSeq: string, network?: string): boolean {
    const key = this.makeKey(address, network);
    return this.knownSequences.has(`${key}:${txSeq}`);
  }

  /**
   * Removes a sequence number from the known set.
   */
  static removeKnownSequence(address: string, txSeq: string, network?: string) {
    const key = this.makeKey(address, network);
    this.knownSequences.delete(`${key}:${txSeq}`);
  }

  /**
   * Rollback the sequence number if a transaction failed before submission or before reaching the ledger.
   * Only rolls back if the tracked sequence matches the one used, ensuring we don't disrupt newer transactions.
   */
  static rollbackSequence(address: string, sequenceUsed: string, network?: string) {
    const key = this.makeKey(address, network);
    const trackedSeq = this.lastSequences.get(key);
    if (trackedSeq && BigInt(trackedSeq) === BigInt(sequenceUsed)) {
      const rolledBack = BigInt(sequenceUsed) - 1n;
      this.lastSequences.set(key, rolledBack.toString());
    }
  }

  /**
   * Reset tracking for an address. Call this when we get a hard sequence error (tx_bad_seq)
   * to force re-synchronization with the network ledger on the next build.
   */
  static reset(address: string, network?: string) {
    const key = this.makeKey(address, network);
    this.lastSequences.delete(key);
    const prefix = `${key}:`;
    for (const item of Array.from(this.knownSequences)) {
      if (item.startsWith(prefix)) {
        this.knownSequences.delete(item);
      }
    }
  }

  /**
   * Reset all sequence tracking across all addresses and networks.
   */
  static resetAll() {
    this.lastSequences.clear();
    this.knownSequences.clear();
  }

  /**
   * Syncs the tracked sequence to the given sequence if it's higher.
   */
  static syncSequence(address: string, sequence: string, network?: string) {
    const key = this.makeKey(address, network);
    const trackedSeq = this.lastSequences.get(key);
    if (!trackedSeq || BigInt(sequence) > BigInt(trackedSeq)) {
      this.lastSequences.set(key, sequence);
    }
  }
}

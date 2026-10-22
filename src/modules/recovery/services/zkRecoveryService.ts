import { recoveryApi } from './recoveryApi';

export interface Groth16ProofInput {
  a: Uint8Array | string; // 64 bytes (Bn254G1Affine)
  b: Uint8Array | string; // 128 bytes (Bn254G2Affine)
  c: Uint8Array | string; // 64 bytes (Bn254G1Affine)
}

export interface ParsedEmlResult {
  from: string;
  to: string;
  subject: string;
  date: string;
  dkimSignature?: string;
  dkimDomain?: string;
  dkimSelector?: string;
  hasDkim: boolean;
  rawHeaders: Record<string, string>;
  body?: string;
  rawContent?: string;
  extractedDestination?: string;
}

/**
 * Parses raw .eml file text according to RFC 5322 header standards,
 * extracting sender, recipient, subject, body, extracted destination address, and DKIM signature details.
 */
export function parseEmlContent(emlText: string): ParsedEmlResult {
  const safeText = typeof emlText === 'string' ? emlText : '';
  const result: ParsedEmlResult = {
    from: '',
    to: '',
    subject: '',
    date: '',
    hasDkim: false,
    rawHeaders: {},
    rawContent: safeText,
  };

  const headerEndIndex = safeText.search(/\r?\n\r?\n/);
  const headerText = headerEndIndex !== -1 ? safeText.slice(0, headerEndIndex) : safeText;
  const bodyText = headerEndIndex !== -1 ? safeText.slice(headerEndIndex).trim() : '';
  result.body = bodyText;

  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    result.rawHeaders[key] = val;

    if (key === 'from') {
      const match = val.match(/<([^>]+)>/);
      result.from = match ? match[1].trim() : val;
    } else if (key === 'to') {
      const match = val.match(/<([^>]+)>/);
      result.to = match ? match[1].trim() : val;
    } else if (key === 'subject') {
      result.subject = val;
    } else if (key === 'date') {
      result.date = val;
    } else if (key === 'dkim-signature' || key === 'x-google-dkim-signature') {
      result.hasDkim = true;
      result.dkimSignature = val;
      const domainMatch = val.match(/\bd=([^;\s]+)/i);
      if (domainMatch) result.dkimDomain = domainMatch[1];
      const selectorMatch = val.match(/\bs=([^;\s]+)/i);
      if (selectorMatch) result.dkimSelector = selectorMatch[1];
    }
  }

  if (!result.hasDkim) {
    const dkimGlobalMatch = emlText.match(
      /(?:dkim-signature|x-google-dkim-signature):\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/i
    );
    if (dkimGlobalMatch) {
      result.hasDkim = true;
      const cleanVal = dkimGlobalMatch[1].replace(/\r?\n[ \t]+/g, ' ').trim();
      result.dkimSignature = cleanVal;
      const domainMatch = cleanVal.match(/\bd=([^;\s]+)/i);
      if (domainMatch) result.dkimDomain = domainMatch[1];
      const selectorMatch = cleanVal.match(/\bs=([^;\s]+)/i);
      if (selectorMatch) result.dkimSelector = selectorMatch[1];
    }
  }

  const subjectMatch = result.subject.match(/\b(G[A-Z2-7]{55})\b/);
  if (subjectMatch) {
    result.extractedDestination = subjectMatch[1];
  } else if (bodyText) {
    const bodyMatch = bodyText.match(/\b(G[A-Z2-7]{55})\b/);
    if (bodyMatch) {
      result.extractedDestination = bodyMatch[1];
    }
  }

  return result;
}

export async function requestRecoveryFromBackend(params: { owner: string; file: File }): Promise<{
  userOpTx?: string;
  txHash?: string;
  hash?: string;
  destination?: string;
  proof?: Groth16ProofInput;
  publicInputs?: (Uint8Array | string)[];
}> {
  const { owner, file } = params;
  if (!owner) throw new Error('Original wallet address is required');
  if (!file) throw new Error('Please select your downloaded raw .eml file');

  return recoveryApi.startRecovery({ owner, file });
}

export async function recordRecoveryRegistrationInBackend(params: {
  email: string;
  walletAddress: string;
}): Promise<boolean> {
  const { email, walletAddress } = params;
  const cleanEmail = (email || '').trim();
  const cleanWallet = (walletAddress || '').trim();

  if (
    !cleanWallet ||
    !cleanWallet.startsWith('G') ||
    cleanWallet.startsWith('0x') ||
    cleanWallet.length !== 56
  ) {
    return false;
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return false;
  }

  try {
    await recoveryApi.saveRecoveryRegistration({
      email: cleanEmail,
      walletAddress: cleanWallet,
    });
    return true;
  } catch (err) {
    console.warn('Failed to record recovery registration in backend:', err);
    return false;
  }
}

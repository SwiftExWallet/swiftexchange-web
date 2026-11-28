const keyFor = (wallet: string | null | undefined): string =>
  `rwa_attestation_v1:${String(wallet || 'anon').toLowerCase()}`;

export const hasAttested = (wallet: string | null | undefined): boolean => {
  if (typeof window === 'undefined' || !wallet) return false;
  try {
    return Boolean(localStorage.getItem(keyFor(wallet)));
  } catch {
    return false;
  }
};

export const saveAttestation = (
  wallet: string | null | undefined,
  country: string | null | undefined
): void => {
  if (typeof window === 'undefined' || !wallet) return;
  try {
    localStorage.setItem(
      keyFor(wallet),
      JSON.stringify({ at: Date.now(), country: country || null })
    );
  } catch {
    // ignore storage quota errors
  }
};

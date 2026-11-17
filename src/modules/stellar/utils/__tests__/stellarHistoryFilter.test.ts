import { describe, expect, it } from 'vitest';

import { matchesTab, normalizeTab } from '../stellarHistoryFilter';

describe('stellarHistoryFilter - matchesTab', () => {
  const myAccount = 'GBQH5C35LQ6TDGT7UD5PQL35CAPWCHCMZ2TRXBEVH3BN6UQI25423YWO';
  const otherAccount = 'GDJLFZX5N5I64S5F4E46637UQUWUZPUTHXSTZLEO7SJMI75ABCDEFGHI';

  describe('normalizeTab', () => {
    it('normalizes various tab strings correctly', () => {
      expect(normalizeTab('ALL')).toBe('all');
      expect(normalizeTab('Send')).toBe('send');
      expect(normalizeTab('RECEIVE')).toBe('receive');
      expect(normalizeTab('trade')).toBe('trade');
      expect(normalizeTab('TRUST')).toBe('trustline');
      expect(normalizeTab('trustline')).toBe('trustline');
      expect(normalizeTab('CLAIMABLE')).toBe('claimable');
      expect(normalizeTab('Bridge')).toBe('bridge');
      expect(normalizeTab('contract')).toBe('contract');
      expect(normalizeTab('unknown_tab')).toBe('all');
    });
  });

  describe('1. Normal Payment', () => {
    it('matches SEND when account is sender and to is another address', () => {
      const op = {
        id: '101',
        type: 'payment',
        from: myAccount,
        to: otherAccount,
        amount: '100.0000000',
        asset_type: 'native',
      };

      expect(matchesTab(op, 'send', myAccount)).toBe(true);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'trade', myAccount)).toBe(false);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });

    it('matches RECEIVE when account is receiver and from is another address', () => {
      const op = {
        id: '102',
        type: 'payment',
        from: otherAccount,
        to: myAccount,
        amount: '50.0000000',
        asset_type: 'native',
      };

      expect(matchesTab(op, 'receive', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'trade', myAccount)).toBe(false);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });
  });

  describe('2. Self Swap / Payment', () => {
    it('treats self-payment (from === to === account) as TRADE, not SEND or RECEIVE', () => {
      const op = {
        id: '103',
        type: 'payment',
        from: myAccount,
        to: myAccount,
        amount: '25.0000000',
        asset_type: 'native',
      };

      expect(matchesTab(op, 'trade', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });

    it('treats path_payment with same source and destination as TRADE', () => {
      const op = {
        id: '104',
        type: 'path_payment_strict_send',
        source_account: myAccount,
        destination: myAccount,
        source_amount: '10.0000000',
        amount: '2.5000000',
      };

      expect(matchesTab(op, 'trade', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
    });
  });

  describe('3. Soroban Transfer In / Out', () => {
    it('matches SEND for Soroban invoke_host_function with asset_balance_changes outgoing only', () => {
      const op = {
        id: '105',
        type: 'invoke_host_function',
        asset_balance_changes: [
          {
            type: 'transfer',
            from: myAccount,
            to: otherAccount,
            amount: '15.0000000',
            asset_code: 'USDC',
          },
        ],
      };

      expect(matchesTab(op, 'send', myAccount)).toBe(true);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'trade', myAccount)).toBe(false);
      expect(matchesTab(op, 'contract', myAccount)).toBe(true);
    });

    it('matches RECEIVE for Soroban invoke_host_function with asset_balance_changes incoming only', () => {
      const op = {
        id: '106',
        type: 'invoke_host_function',
        asset_balance_changes: [
          {
            type: 'transfer',
            from: otherAccount,
            to: myAccount,
            amount: '30.0000000',
            asset_code: 'USDC',
          },
        ],
      };

      expect(matchesTab(op, 'receive', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'trade', myAccount)).toBe(false);
      expect(matchesTab(op, 'contract', myAccount)).toBe(true);
    });

    it('matches TRADE for Soroban swap with both outgoing and incoming asset_balance_changes', () => {
      const op = {
        id: '107',
        type: 'invoke_host_function',
        asset_balance_changes: [
          {
            type: 'transfer',
            from: myAccount,
            to: otherAccount,
            amount: '100.0000000',
            asset_type: 'native',
          },
          {
            type: 'transfer',
            from: otherAccount,
            to: myAccount,
            amount: '12.5000000',
            asset_code: 'USDC',
          },
        ],
      };

      expect(matchesTab(op, 'trade', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'contract', myAccount)).toBe(true);
    });
  });

  describe('4. Change Trust (Trustline)', () => {
    it('matches TRUSTLINE for change_trust operation', () => {
      const op = {
        id: '108',
        type: 'change_trust',
        source_account: myAccount,
        asset_code: 'USDC',
        asset_issuer: otherAccount,
        limit: '1000000',
      };

      expect(matchesTab(op, 'trustline', myAccount)).toBe(true);
      expect(matchesTab(op, 'trust', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'trade', myAccount)).toBe(false);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });

    it('matches TRUSTLINE for allow_trust and set_trust_line_flags', () => {
      expect(matchesTab({ id: '109', type: 'allow_trust' }, 'trustline', myAccount)).toBe(true);
      expect(matchesTab({ id: '110', type: 'set_trust_line_flags' }, 'trustline', myAccount)).toBe(
        true
      );
    });
  });

  describe('5. Claimable Balance', () => {
    it('matches CLAIMABLE for create_claimable_balance', () => {
      const op = {
        id: '111',
        type: 'create_claimable_balance',
        sponsor: myAccount,
        asset: 'XLM',
        amount: '10.0000000',
      };

      expect(matchesTab(op, 'claimable', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });

    it('matches CLAIMABLE for claim_claimable_balance', () => {
      const op = {
        id: '112',
        type: 'claim_claimable_balance',
        balance_id: '000000001111111122222222',
        claimant: myAccount,
      };

      expect(matchesTab(op, 'claimable', myAccount)).toBe(true);
      expect(matchesTab(op, 'all', myAccount)).toBe(true);
    });
  });

  describe('6. Edge Cases & Account Creation/Merge', () => {
    it('matches RECEIVE for create_account when account is the newly created account', () => {
      const op = {
        id: '113',
        type: 'create_account',
        account: myAccount,
        funder: otherAccount,
        starting_balance: '5.0000000',
      };
      expect(matchesTab(op, 'receive', myAccount)).toBe(true);
      expect(matchesTab(op, 'send', myAccount)).toBe(false);
    });

    it('matches SEND for create_account when account is the funder', () => {
      const op = {
        id: '114',
        type: 'create_account',
        account: otherAccount,
        funder: myAccount,
        starting_balance: '5.0000000',
      };
      expect(matchesTab(op, 'send', myAccount)).toBe(true);
      expect(matchesTab(op, 'receive', myAccount)).toBe(false);
    });

    it('matches BRIDGE for transactions with numeric memo', () => {
      const op = {
        id: '115',
        type: 'payment',
        from: myAccount,
        to: otherAccount,
        memo: '123456789',
      };
      expect(matchesTab(op, 'bridge', myAccount)).toBe(true);
    });
  });
});

import { describe, expect, it } from 'vitest';

import { AsterRateLimitError, parseAsterError } from '../api/errors';

describe('Aster Error Handling & Classification (ERR-01, ERR-04)', () => {
  it('correctly maps known Aster error codes with user-friendly messages', () => {
    const marginErr = parseAsterError({ code: -2019, msg: 'Margin is insufficient.' });
    expect(marginErr.code).toBe(-2019);
    expect(marginErr.name).toBe('MARGIN_NOT_SUFFICIENT');
    expect(marginErr.userMessage).toContain('Insufficient margin');
    expect(marginErr.isRetryable).toBe(false);

    const minNotionalErr = parseAsterError({ code: -4164, msg: 'Order notional too small.' });
    expect(minNotionalErr.code).toBe(-4164);
    expect(minNotionalErr.name).toBe('ORDER_NOTIONAL_TOO_SMALL');
    expect(minNotionalErr.isRetryable).toBe(false);
  });

  it('classifies network and server drops as retryable', () => {
    const disconnErr = parseAsterError({ code: -1001, msg: 'Disconnected' });
    expect(disconnErr.isRetryable).toBe(true);

    const timeoutErr = parseAsterError({ code: -1007, msg: 'Timeout' });
    expect(timeoutErr.isRetryable).toBe(true);

    const rateLimitErr = parseAsterError({ code: -1003, msg: 'Too many requests' });
    expect(rateLimitErr.isRetryable).toBe(true);
  });

  it('classifies client-side validation and wallet rejections as permanent (non-retryable)', () => {
    const rejectedErr = parseAsterError(new Error('User rejected the transaction.'));
    expect(rejectedErr.code).toBe(4001);
    expect(rejectedErr.name).toBe('USER_REJECTED');
    expect(rejectedErr.isRetryable).toBe(false);

    const triggerErr = parseAsterError(new Error('Order would immediately trigger.'));
    expect(triggerErr.code).toBe(-2021);
    expect(triggerErr.name).toBe('ORDER_WOULD_IMMEDIATELY_TRIGGER');
    expect(triggerErr.isRetryable).toBe(false);
  });

  it('AsterRateLimitError correctly encapsulates status and retryAfterSec', () => {
    const err = new AsterRateLimitError(429, 30);
    expect(err.name).toBe('AsterRateLimitError');
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect(err.message).toContain('30s');
  });
});

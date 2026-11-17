export class AsterClientError extends Error {
  readonly userMessage: string;
  readonly isRetryable: boolean;

  constructor(message: string, userMessage: string = message, isRetryable: boolean = false) {
    super(message);
    this.name = 'AsterClientError';
    this.userMessage = userMessage;
    this.isRetryable = isRetryable;
  }
}

export class AsterBannedError extends AsterClientError {
  readonly bannedUntilMs: number;
  readonly formattedExpiry: string;

  constructor(bannedUntilMs: number, rawMsg?: string) {
    const formatted = new Date(bannedUntilMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const userMsg = `Exchange temporarily restricted IP until ${formatted}. Data will resume automatically.`;
    super(
      `IP banned by Aster until ${bannedUntilMs} (${formatted})${rawMsg ? `: ${rawMsg}` : ''}`,
      userMsg,
      false
    );
    this.name = 'AsterBannedError';
    this.bannedUntilMs = bannedUntilMs;
    this.formattedExpiry = formatted;
  }
}

export class AsterRateLimitError extends AsterClientError {
  readonly status: number;
  readonly retryAfterSec: number;

  constructor(status: number, retryAfterSec: number = 60) {
    super(
      `Aster rate limit exceeded (HTTP ${status}). Back off for ${retryAfterSec}s.`,
      `Rate limit exceeded. Waiting ${retryAfterSec}s before retrying.`,
      false
    );
    this.name = 'AsterRateLimitError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export class AsterCircuitBreakerError extends AsterClientError {
  readonly cooldownRemainingMs: number;

  constructor(cooldownRemainingMs: number) {
    super(
      `Circuit breaker open due to consecutive failures. Cooling down (${Math.ceil(cooldownRemainingMs / 1000)}s remaining).`,
      'Exchange service temporarily unstable. Pausing requests briefly.',
      false
    );
    this.name = 'AsterCircuitBreakerError';
    this.cooldownRemainingMs = cooldownRemainingMs;
  }
}

export class AsterHttpError extends AsterClientError {
  readonly status: number;
  readonly bodyText?: string;

  constructor(status: number, statusText: string, bodyText?: string) {
    let userMsg = `Exchange service error (HTTP ${status}). Please try again shortly.`;
    if (status === 403 || status === 401) {
      userMsg = 'Access denied by exchange. Please check your credentials or permissions.';
    } else if (status >= 500) {
      userMsg = 'Exchange servers are experiencing temporary issues. Retrying shortly.';
    }
    super(`HTTP Error ${status}: ${statusText}`, userMsg, status >= 500);
    this.name = 'AsterHttpError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

export class AsterNetworkError extends AsterClientError {
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message, 'Network connection issue. Please check your internet connection.', true);
    this.name = 'AsterNetworkError';
    this.originalError = originalError;
  }
}

export class AsterParsingError extends AsterClientError {
  readonly rawText?: string;

  constructor(message: string, rawText?: string) {
    super(message, 'Received unexpected response from the exchange.', false);
    this.name = 'AsterParsingError';
    this.rawText = rawText;
  }
}

export class AsterUserRejectedError extends AsterClientError {
  constructor(message: string = 'User rejected the signature or transaction.') {
    super(message, 'Signature request was rejected in your wallet.', false);
    this.name = 'AsterUserRejectedError';
  }
}

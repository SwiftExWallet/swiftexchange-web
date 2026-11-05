import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as soundModule from '@/utils/notificationSound';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Notification } from '../Notification';

describe('Notification Component', () => {
  let playSoundSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    playSoundSpy = vi.spyOn(soundModule, 'playNotificationSound').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders title and message correctly', () => {
    render(
      <Notification
        type="success"
        title="Transaction Sent"
        message="Your transaction was submitted successfully."
      />
    );

    expect(screen.getByText('Transaction Sent')).toBeInTheDocument();
    expect(screen.getByText('Your transaction was submitted successfully.')).toBeInTheDocument();
  });

  it('plays notification sound on mount by default', () => {
    render(<Notification type="success" message="Success message" />);

    expect(playSoundSpy).toHaveBeenCalledTimes(1);
    expect(playSoundSpy).toHaveBeenCalledWith('success');
  });

  it('does not play sound when playSound is false', () => {
    render(<Notification type="info" message="Muted notification" playSound={false} />);

    expect(playSoundSpy).not.toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Notification type="error" message="Error occurred" onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /close notification/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after autoCloseDuration', () => {
    const handleClose = vi.fn();
    render(
      <Notification
        type="warning"
        message="Warning warning"
        onClose={handleClose}
        autoClose={true}
        autoCloseDuration={3000}
      />
    );

    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

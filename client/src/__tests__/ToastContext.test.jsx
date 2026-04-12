import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../contexts/ToastContext.jsx';

function TestConsumer() {
  const { toasts, addToast, dismissToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast('Hello', 'success')} data-testid="add-success">Add</button>
      <button onClick={() => addToast('Oops', 'error')} data-testid="add-error">Error</button>
      {toasts.map((t) => (
        <div key={t.id} data-testid={`toast-${t.type}`}>
          {t.message}
          <button onClick={() => dismissToast(t.id)} data-testid={`dismiss-${t.id}`}>X</button>
        </div>
      ))}
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>
  );
}

describe('ToastContext', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('addToast adds a toast with correct type', () => {
    renderWithProvider();
    act(() => { screen.getByTestId('add-success').click(); });
    expect(screen.getByTestId('toast-success')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('dismissToast removes the toast', () => {
    renderWithProvider();
    act(() => { screen.getByTestId('add-success').click(); });
    const toast = screen.getByTestId('toast-success');
    expect(toast).toBeTruthy();
    const dismissBtn = toast.querySelector('[data-testid^="dismiss-"]');
    act(() => { dismissBtn.click(); });
    expect(screen.queryByTestId('toast-success')).toBeNull();
  });

  it('auto-dismisses after 5 seconds', () => {
    renderWithProvider();
    act(() => { screen.getByTestId('add-error').click(); });
    expect(screen.getByTestId('toast-error')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByTestId('toast-error')).toBeNull();
  });

  it('limits to 5 visible toasts', () => {
    renderWithProvider();
    act(() => {
      for (let i = 0; i < 7; i++) screen.getByTestId('add-success').click();
    });
    const toasts = screen.getAllByTestId('toast-success');
    expect(toasts.length).toBeLessThanOrEqual(5);
  });
});

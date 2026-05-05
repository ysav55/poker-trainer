import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../contexts/ToastContext.jsx';
import ToastContainer from '../components/ToastContainer.jsx';

function Trigger({ message, type }) {
  const { addToast } = useToast();
  return <button onClick={() => addToast(message, type)} data-testid="trigger">Fire</button>;
}

function renderWithToasts() {
  return render(
    <ToastProvider>
      <Trigger message="Test toast" type="success" />
      <ToastContainer />
    </ToastProvider>
  );
}

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders toast message after addToast', () => {
    renderWithToasts();
    act(() => { screen.getByTestId('trigger').click(); });
    expect(screen.getByText('Test toast')).toBeTruthy();
  });

  it('renders correct type styling via data-type attribute', () => {
    renderWithToasts();
    act(() => { screen.getByTestId('trigger').click(); });
    const alert = screen.getByRole('alert');
    expect(alert.dataset.type).toBe('success');
  });
});

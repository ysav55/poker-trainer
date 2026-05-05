import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportDialog from '../ExportDialog.jsx';

describe('ExportDialog', () => {
  beforeEach(() => {
    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };
  });

  it('renders nothing when open=false', () => {
    const { container } = render(<ExportDialog open={false} onClose={() => {}} tableId="t1" />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('renders dialog when open=true', () => {
    const { container } = render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it('renders format radio buttons', () => {
    render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const csvRadio = screen.getByLabelText(/CSV/i);
    const xlsxRadio = screen.getByLabelText(/Excel/i);
    expect(csvRadio).toBeTruthy();
    expect(xlsxRadio).toBeTruthy();
  });

  it('CSV is checked by default', () => {
    render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const csvRadio = screen.getByDisplayValue('csv');
    expect(csvRadio.checked).toBe(true);
  });

  it('allows changing format to XLSX', () => {
    render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const xlsxRadio = screen.getByDisplayValue('xlsx');
    fireEvent.click(xlsxRadio);
    expect(xlsxRadio.checked).toBe(true);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ExportDialog open={true} onClose={onClose} tableId="t1" />);
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<ExportDialog open={true} onClose={onClose} tableId="t1" />);
    const backdrop = container.querySelector('[role="dialog"]');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ExportDialog open={true} onClose={onClose} tableId="t1" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Export button when tableId is missing', () => {
    render(<ExportDialog open={true} onClose={() => {}} tableId={null} />);
    const exportBtn = screen.getByText('↓ Export');
    expect(exportBtn).toBeDisabled();
  });

  it('enables Export button when tableId is present', () => {
    render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const exportBtn = screen.getByText('↓ Export');
    expect(exportBtn).not.toBeDisabled();
  });

  it('triggers download with correct URL for CSV', () => {
    vi.useFakeTimers();
    render(<ExportDialog open={true} onClose={() => {}} tableId="t-123" />);
    const exportBtn = screen.getByText('↓ Export');
    fireEvent.click(exportBtn);
    expect(window.location.href).toMatch(/\/api\/exports\/hands\?tableId=t-123&format=csv/);
    vi.useRealTimers();
  });

  it('triggers download with correct URL for XLSX', () => {
    vi.useFakeTimers();
    render(<ExportDialog open={true} onClose={() => {}} tableId="t-123" />);
    const xlsxRadio = screen.getByDisplayValue('xlsx');
    fireEvent.click(xlsxRadio);
    const exportBtn = screen.getByText('↓ Export');
    fireEvent.click(exportBtn);
    expect(window.location.href).toMatch(/\/api\/exports\/hands\?tableId=t-123&format=xlsx/);
    vi.useRealTimers();
  });

  it('shows "Downloading…" while download is in progress', () => {
    vi.useFakeTimers();
    render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const exportBtn = screen.getByText('↓ Export');
    fireEvent.click(exportBtn);
    expect(screen.getByText('Downloading…')).toBeTruthy();
    vi.useRealTimers();
  });

  it('stops propagation when dialog content is clicked', () => {
    const { container } = render(<ExportDialog open={true} onClose={() => {}} tableId="t1" />);
    const dialog = container.querySelector('[role="dialog"]');
    const content = dialog.querySelector('div[style*="background"]');
    const event = new MouseEvent('click', { bubbles: true });
    const stopPropagation = vi.fn();
    event.stopPropagation = stopPropagation;
    content.dispatchEvent(event);
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('encodes special characters in tableId URL param', () => {
    vi.useFakeTimers();
    render(<ExportDialog open={true} onClose={() => {}} tableId="t id/special" />);
    const exportBtn = screen.getByText('↓ Export');
    fireEvent.click(exportBtn);
    expect(window.location.href).toMatch(/tableId=t%20id%2Fspecial/);
    vi.useRealTimers();
  });
});

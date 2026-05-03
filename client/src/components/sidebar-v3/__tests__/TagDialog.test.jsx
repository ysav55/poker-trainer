import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TagDialog from '../TagDialog.jsx';

const sampleTags = ['BLUFF', 'VALUE_BET', 'BAD_FOLD'];

describe('TagDialog', () => {
  it('renders existing tags as toggleable chips', () => {
    render(<TagDialog open availableTags={sampleTags} initialTags={[]} onSubmit={vi.fn()} onClose={vi.fn()} />);
    sampleTags.forEach((t) => expect(screen.getByRole('button', { name: t })).toBeInTheDocument());
  });

  it('Save calls onSubmit with selected tag list', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={['BLUFF']} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'VALUE_BET' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(['BLUFF', 'VALUE_BET']);
    expect(onClose).toHaveBeenCalled();
  });

  it('Custom tag input adds a new tag on Add button', () => {
    const onSubmit = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={[]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/custom tag/i), { target: { value: 'HERO_CALL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(['HERO_CALL']);
  });

  it('Cancel calls onClose without onSubmit', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={['BLUFF']} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('returns null when open is false', () => {
    const { container } = render(<TagDialog open={false} availableTags={sampleTags} initialTags={[]} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

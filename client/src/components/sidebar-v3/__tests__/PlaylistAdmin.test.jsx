import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlaylistAdmin, { PlaylistRowMenu } from '../PlaylistAdmin.jsx';

const noopEmit = {
  createPlaylist: vi.fn(),
  renamePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
};

describe('PlaylistAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders + New Playlist button', () => {
    render(<PlaylistAdmin emit={noopEmit} />);
    expect(screen.getByRole('button', { name: /\+ New Playlist/ })).toBeInTheDocument();
  });

  it('clicking + New shows name input + Create + Cancel', () => {
    render(<PlaylistAdmin emit={noopEmit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    expect(screen.getByPlaceholderText(/Playlist name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Create button calls emit.createPlaylist with trimmed name', () => {
    const emit = { ...noopEmit, createPlaylist: vi.fn() };
    render(<PlaylistAdmin emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    const input = screen.getByPlaceholderText(/Playlist name/);
    fireEvent.change(input, { target: { value: '  Bluff catching  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(emit.createPlaylist).toHaveBeenCalledWith('Bluff catching');
  });

  it('Enter key in name input triggers Create', () => {
    const emit = { ...noopEmit, createPlaylist: vi.fn() };
    render(<PlaylistAdmin emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    const input = screen.getByPlaceholderText(/Playlist name/);
    fireEvent.change(input, { target: { value: 'Test Playlist' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(emit.createPlaylist).toHaveBeenCalledWith('Test Playlist');
  });

  it('Create is disabled when name is empty', () => {
    render(<PlaylistAdmin emit={noopEmit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('Create is disabled when name is only whitespace', () => {
    render(<PlaylistAdmin emit={noopEmit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    const input = screen.getByPlaceholderText(/Playlist name/);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('Cancel closes the input and resets state', () => {
    render(<PlaylistAdmin emit={noopEmit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText(/Playlist name/)).toBeNull();
    expect(screen.getByRole('button', { name: /\+ New Playlist/ })).toBeInTheDocument();
  });

  it('Creates playlist successfully and closes form', () => {
    const emit = { ...noopEmit, createPlaylist: vi.fn() };
    render(<PlaylistAdmin emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Playlist/ }));
    const input = screen.getByPlaceholderText(/Playlist name/);
    fireEvent.change(input, { target: { value: 'My Playlist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(emit.createPlaylist).toHaveBeenCalledWith('My Playlist');
    expect(screen.queryByPlaceholderText(/Playlist name/)).toBeNull();
  });

  it('disables + New button when emit.createPlaylist is missing', () => {
    const emit = { createPlaylist: undefined };
    render(<PlaylistAdmin emit={emit} />);
    expect(screen.getByRole('button', { name: /\+ New Playlist/ })).toBeDisabled();
  });
});

describe('PlaylistRowMenu', () => {
  const playlist = { id: 'pl1', name: 'Test Playlist', count: 5 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Rename and Delete buttons', () => {
    render(<PlaylistRowMenu playlist={playlist} emit={noopEmit} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('clicking Rename shows input with current name', () => {
    render(<PlaylistRowMenu playlist={playlist} emit={noopEmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Test Playlist');
    expect(input).toBeInTheDocument();
  });

  it('Rename Save button calls emit.renamePlaylist with playlistId and new name', () => {
    const emit = { ...noopEmit, renamePlaylist: vi.fn() };
    const onClose = vi.fn();
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Test Playlist');
    fireEvent.change(input, { target: { value: 'Renamed Playlist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(emit.renamePlaylist).toHaveBeenCalledWith('pl1', 'Renamed Playlist');
    expect(onClose).toHaveBeenCalled();
  });

  it('Rename with Enter key saves and closes', () => {
    const emit = { ...noopEmit, renamePlaylist: vi.fn() };
    const onClose = vi.fn();
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Test Playlist');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(emit.renamePlaylist).toHaveBeenCalledWith('pl1', 'New Name');
    expect(onClose).toHaveBeenCalled();
  });

  it('Rename with Escape key cancels and closes', () => {
    const emit = { ...noopEmit, renamePlaylist: vi.fn() };
    const onClose = vi.fn();
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.keyDown(screen.getByDisplayValue('Test Playlist'), { key: 'Escape' });
    expect(emit.renamePlaylist).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Rename to same name does not call emit and closes', () => {
    const emit = { ...noopEmit, renamePlaylist: vi.fn() };
    const onClose = vi.fn();
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    // Keep the same name
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(emit.renamePlaylist).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Delete with confirmation calls emit.deletePlaylist', () => {
    const emit = { ...noopEmit, deletePlaylist: vi.fn() };
    const onClose = vi.fn();
    const realConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(emit.deletePlaylist).toHaveBeenCalledWith('pl1');
    expect(onClose).toHaveBeenCalled();

    window.confirm = realConfirm;
  });

  it('Delete with declined confirmation does NOT call emit', () => {
    const emit = { ...noopEmit, deletePlaylist: vi.fn() };
    const onClose = vi.fn();
    const realConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(emit.deletePlaylist).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    window.confirm = realConfirm;
  });

  it('disables Rename button when emit.renamePlaylist is missing', () => {
    const emit = { ...noopEmit, renamePlaylist: undefined };
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  it('disables Delete button when emit.deletePlaylist is missing', () => {
    const emit = { ...noopEmit, deletePlaylist: undefined };
    render(<PlaylistRowMenu playlist={playlist} emit={emit} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

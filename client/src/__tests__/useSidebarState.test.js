import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarState } from '../components/SideNav/useSidebarState.js';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });
});

describe('useSidebarState', () => {
  it('defaults to expanded', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.expanded).toBe(true);
  });

  it('toggle flips the state', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggle());
    expect(localStorage.getItem('sidebar-expanded')).toBe('false');
  });

  it('reads from localStorage on mount', () => {
    localStorage.setItem('sidebar-expanded', 'false');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.expanded).toBe(false);
  });

  it('auto-collapses below 1280px when no stored preference', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.expanded).toBe(false);
  });
});

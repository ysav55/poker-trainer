# UI Redesign V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat emoji sidebar, split the 1064-line LobbyPage into Dashboard + Tables, and decompose the 2794-line PlayerCRM into a roster page + student dashboard with 12 collapsible section cards.

**Architecture:** Foundation-first approach — semantic color tokens and toast improvements ship before any page changes. New sidebar (expandable/collapsible, role-adaptive header) replaces both old SideNav and GlobalTopBar. LobbyPage splits into DashboardPage (role-adaptive widgets) + TablesPage (filter tabs including bot). PlayerCRM splits into StudentsRosterPage (data table) + StudentDashboardPage (collapsible cards using existing CollapsibleSection component enhanced with localStorage persistence).

**Tech Stack:** React 18, react-router-dom 6, Tailwind 3.4, Vite 5, lucide-react (new), recharts 3.8, vitest 4

**Spec:** `docs/superpowers/specs/2026-04-12-ui-redesign-v1-design.md`

---

## Phase 1 — Foundation

### Task 1: Semantic Color Tokens

**Files:**
- Create: `client/src/lib/colors.js`
- Test: `client/src/__tests__/colors.test.js`

- [ ] **Step 1: Write the test**

```js
// client/src/__tests__/colors.test.js
import { describe, it, expect } from 'vitest';
import { colors } from '../lib/colors.js';

describe('colors', () => {
  it('exports all required token keys', () => {
    const required = [
      'bgPrimary', 'bgSurface', 'bgSurfaceRaised', 'bgSurfaceHover',
      'textPrimary', 'textSecondary', 'textMuted',
      'gold', 'goldHover', 'goldSubtle',
      'success', 'error', 'warning', 'info',
      'borderDefault', 'borderStrong',
    ];
    for (const key of required) {
      expect(colors).toHaveProperty(key);
      expect(typeof colors[key]).toBe('string');
    }
  });

  it('all values are valid CSS color strings', () => {
    for (const [key, value] of Object.entries(colors)) {
      expect(value).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\(.+\))$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/colors.test.js`
Expected: FAIL — module `../lib/colors.js` not found

- [ ] **Step 3: Create the colors module**

```js
// client/src/lib/colors.js
export const colors = {
  bgPrimary: '#060a0f',
  bgSurface: '#0d1117',
  bgSurfaceRaised: '#161b22',
  bgSurfaceHover: '#1c2128',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6e7681',
  gold: '#d4af37',
  goldHover: '#e6c34d',
  goldSubtle: 'rgba(212,175,55,0.07)',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
  borderDefault: '#21262d',
  borderStrong: '#30363d',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/colors.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/colors.js client/src/__tests__/colors.test.js
git commit -m "feat(ui): add semantic color tokens (colors.js)"
```

---

### Task 2: Install lucide-react

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install the dependency**

Run: `cd client && npm install lucide-react`

- [ ] **Step 2: Verify it installed**

Run: `cd client && node -e "require('lucide-react'); console.log('OK')"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add lucide-react icon library"
```

---

### Task 3: Toast System — useToast Hook

The existing `useNotifications` hook has `addError` and `addNotification`. We wrap it with a unified `useToast()` that adds toast types (success, error, info, warning) and is provided via React context so any component can trigger a toast.

**Files:**
- Create: `client/src/contexts/ToastContext.jsx`
- Test: `client/src/__tests__/ToastContext.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/ToastContext.test.jsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/ToastContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create ToastContext**

```jsx
// client/src/contexts/ToastContext.jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismissToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, message, type, createdAt: Date.now() };
    setToasts((prev) => [entry, ...prev].slice(0, MAX_TOASTS));
    timersRef.current[id] = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/ToastContext.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/ToastContext.jsx client/src/__tests__/ToastContext.test.jsx
git commit -m "feat(ui): add ToastContext with useToast hook"
```

---

### Task 4: Toast Container Component

Renders the fixed toast stack in the viewport corner. Wired into AppLayout in Phase 2.

**Files:**
- Create: `client/src/components/ToastContainer.jsx`
- Test: `client/src/__tests__/ToastContainer.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/ToastContainer.test.jsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/ToastContainer.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create ToastContainer**

```jsx
// client/src/components/ToastContainer.jsx
import React from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import { colors } from '../lib/colors.js';
import { X } from 'lucide-react';

const TYPE_STYLES = {
  error:   { borderColor: colors.error,   icon: '⚠' },
  success: { borderColor: colors.success, icon: '✓' },
  info:    { borderColor: colors.gold,    icon: 'ℹ' },
  warning: { borderColor: colors.warning, icon: '⚠' },
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type] ?? TYPE_STYLES.info;
        return (
          <div
            key={toast.id}
            role="alert"
            data-type={toast.type}
            className="flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl cursor-pointer"
            style={{
              background: colors.bgSurfaceRaised,
              border: `1px solid ${style.borderColor}`,
              backdropFilter: 'blur(8px)',
            }}
            onClick={() => dismissToast(toast.id)}
          >
            <span className="text-sm shrink-0 mt-0.5" style={{ color: style.borderColor }}>
              {style.icon}
            </span>
            <span className="text-sm flex-1" style={{ color: colors.textPrimary }}>
              {toast.message}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
              className="shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X size={14} style={{ color: colors.textMuted }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/ToastContainer.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ToastContainer.jsx client/src/__tests__/ToastContainer.test.jsx
git commit -m "feat(ui): add ToastContainer component"
```

---

## Phase 2 — Sidebar + Layout

### Task 5: useSidebarState Hook

Manages expand/collapse state with localStorage persistence and auto-collapse below 1280px.

**Files:**
- Create: `client/src/components/SideNav/useSidebarState.js`
- Test: `client/src/__tests__/useSidebarState.test.js`

- [ ] **Step 1: Write the test**

```js
// client/src/__tests__/useSidebarState.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarState } from '../components/SideNav/useSidebarState.js';

beforeEach(() => {
  localStorage.clear();
  // Default to wide viewport
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

  it('auto-collapses below 1280px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.expanded).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/useSidebarState.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the hook**

```js
// client/src/components/SideNav/useSidebarState.js
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sidebar-expanded';
const AUTO_COLLAPSE_WIDTH = 1280;

function getInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return window.innerWidth >= AUTO_COLLAPSE_WIDTH;
}

export function useSidebarState() {
  const [expanded, setExpanded] = useState(getInitial);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Auto-collapse on resize below threshold (only if user hasn't manually set)
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < AUTO_COLLAPSE_WIDTH && localStorage.getItem(STORAGE_KEY) === null) {
        setExpanded(false);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return { expanded, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/useSidebarState.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/useSidebarState.js client/src/__tests__/useSidebarState.test.js
git commit -m "feat(ui): add useSidebarState hook with localStorage persistence"
```

---

### Task 6: NavItem Component

Single navigation item with icon, label, badge, and active state.

**Files:**
- Create: `client/src/components/SideNav/NavItem.jsx`
- Test: `client/src/__tests__/NavItem.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/NavItem.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import NavItem from '../components/SideNav/NavItem.jsx';
import { Home } from 'lucide-react';

function renderItem(props = {}) {
  const defaults = {
    icon: Home,
    label: 'Dashboard',
    path: '/dashboard',
    expanded: true,
    active: false,
  };
  return render(
    <MemoryRouter>
      <NavItem {...defaults} {...props} />
    </MemoryRouter>
  );
}

describe('NavItem', () => {
  it('renders label when expanded', () => {
    renderItem({ expanded: true });
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('hides label when collapsed', () => {
    renderItem({ expanded: false });
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('renders a link to the correct path', () => {
    renderItem({ path: '/dashboard' });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('shows badge dot when badge is true', () => {
    renderItem({ badge: true });
    expect(screen.getByTestId('nav-badge')).toBeTruthy();
  });

  it('does not show badge dot when badge is falsy', () => {
    renderItem({ badge: false });
    expect(screen.queryByTestId('nav-badge')).toBeNull();
  });

  it('applies active styling', () => {
    renderItem({ active: true });
    const link = screen.getByRole('link');
    expect(link.style.borderLeft).toContain('#d4af37');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/NavItem.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create NavItem**

```jsx
// client/src/components/SideNav/NavItem.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { colors } from '../../lib/colors.js';

export default function NavItem({ icon: Icon, label, path, expanded, active, badge }) {
  return (
    <NavLink
      to={path}
      className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors no-underline"
      style={{
        borderLeft: active ? `3px solid ${colors.gold}` : '3px solid transparent',
        background: active ? colors.goldSubtle : 'transparent',
        color: active ? colors.gold : colors.textSecondary,
      }}
      title={!expanded ? label : undefined}
    >
      <Icon size={20} className="shrink-0" />
      {expanded && (
        <span className="text-xs font-medium truncate">{label}</span>
      )}
      {badge && (
        <span
          data-testid="nav-badge"
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: colors.error, marginLeft: expanded ? 'auto' : 0 }}
        />
      )}
    </NavLink>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/NavItem.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/NavItem.jsx client/src/__tests__/NavItem.test.jsx
git commit -m "feat(ui): add NavItem sidebar component"
```

---

### Task 7: NavGroup Component

Section header (HOME, COACHING) with children. Hidden when collapsed.

**Files:**
- Create: `client/src/components/SideNav/NavGroup.jsx`
- Test: `client/src/__tests__/NavGroup.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/NavGroup.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import NavGroup from '../components/SideNav/NavGroup.jsx';

describe('NavGroup', () => {
  it('renders label when expanded', () => {
    render(<NavGroup label="COACHING" expanded={true}><div>child</div></NavGroup>);
    expect(screen.getByText('COACHING')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('hides label when collapsed, still renders children', () => {
    render(<NavGroup label="COACHING" expanded={false}><div>child</div></NavGroup>);
    expect(screen.queryByText('COACHING')).toBeNull();
    expect(screen.getByText('child')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/NavGroup.test.jsx`
Expected: FAIL

- [ ] **Step 3: Create NavGroup**

```jsx
// client/src/components/SideNav/NavGroup.jsx
import React from 'react';
import { colors } from '../../lib/colors.js';

export default function NavGroup({ label, expanded, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      {expanded && (
        <span
          className="text-[10px] font-bold tracking-widest uppercase px-3 pt-4 pb-1"
          style={{ color: colors.textMuted }}
        >
          {label}
        </span>
      )}
      {!expanded && <div className="my-2 mx-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/NavGroup.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/NavGroup.jsx client/src/__tests__/NavGroup.test.jsx
git commit -m "feat(ui): add NavGroup sidebar section component"
```

---

### Task 8: SidebarHeader Component

Shows user info, chip balance, and role-adaptive school stats or school name.

**Files:**
- Create: `client/src/components/SideNav/SidebarHeader.jsx`
- Test: `client/src/__tests__/SidebarHeader.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/SidebarHeader.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Jo', role: 'coach' },
  }),
}));

import SidebarHeader from '../components/SideNav/SidebarHeader.jsx';

describe('SidebarHeader', () => {
  it('shows user name when expanded', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} />);
    expect(screen.getByText('Jo')).toBeTruthy();
  });

  it('shows chip balance', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} />);
    expect(screen.getByText('1,270')).toBeTruthy();
  });

  it('shows N/A when chipBalance is null', () => {
    render(<SidebarHeader expanded={true} chipBalance={null} />);
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('hides name and details when collapsed', () => {
    render(<SidebarHeader expanded={false} chipBalance={1270} />);
    expect(screen.queryByText('Jo')).toBeNull();
  });

  it('shows school stats for coaches', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} studentsOnline={3} activeTables={2} />);
    expect(screen.getByText(/3 online/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/SidebarHeader.test.jsx`
Expected: FAIL

- [ ] **Step 3: Create SidebarHeader**

```jsx
// client/src/components/SideNav/SidebarHeader.jsx
import React from 'react';
import { colors } from '../../lib/colors.js';
import { Coins } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

export default function SidebarHeader({ expanded, chipBalance, schoolName, studentsOnline, activeTables }) {
  const { user } = useAuth();
  const isCoach = COACH_ROLES.has(user?.role);

  const chipDisplay = chipBalance != null ? Number(chipBalance).toLocaleString() : 'N/A';

  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-1 py-3 px-2">
        <Coins size={16} style={{ color: colors.gold }} />
        <span className="text-[10px] font-mono tabular-nums" style={{ color: colors.textSecondary }}>
          {chipBalance != null ? Number(chipBalance).toLocaleString() : '—'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-4" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
      <span className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
        {user?.name ?? 'User'}
      </span>
      <div className="flex items-center gap-1.5">
        <Coins size={14} style={{ color: colors.gold }} />
        <span className="text-xs font-mono tabular-nums" style={{ color: colors.textPrimary }}>
          {chipDisplay}
        </span>
      </div>
      {isCoach && studentsOnline != null && (
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {studentsOnline} online · {activeTables ?? 0} tables
        </span>
      )}
      {!isCoach && schoolName && (
        <span className="text-xs truncate" style={{ color: colors.textMuted }}>
          {schoolName}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/SidebarHeader.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/SidebarHeader.jsx client/src/__tests__/SidebarHeader.test.jsx
git commit -m "feat(ui): add SidebarHeader with role-adaptive content"
```

---

### Task 9: SideNav Composition Root

Brings together NavGroup, NavItem, SidebarHeader, and useSidebarState. Replaces old `SideNav.jsx`.

**Files:**
- Create: `client/src/components/SideNav/SideNav.jsx`
- Create: `client/src/components/SideNav/index.js`
- Test: `client/src/__tests__/SideNav.new.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/SideNav.new.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext.jsx';
import SideNav from '../components/SideNav/SideNav.jsx';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });
});

function renderNav(role = 'coach', chipBalance = 1000) {
  useAuth.mockReturnValue({
    user: { id: 'u1', name: 'Test Coach', role },
  });
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SideNav chipBalance={chipBalance} />
    </MemoryRouter>
  );
}

describe('SideNav', () => {
  it('shows HOME items for all roles', () => {
    renderNav('coached_student');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Tables')).toBeTruthy();
    expect(screen.getByText('Tournaments')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Leaderboard')).toBeTruthy();
  });

  it('shows COACHING section for coaches', () => {
    renderNav('coach');
    expect(screen.getByText('Students')).toBeTruthy();
    expect(screen.getByText('Groups')).toBeTruthy();
    expect(screen.getByText('Scenarios')).toBeTruthy();
  });

  it('hides COACHING section for students', () => {
    renderNav('coached_student');
    expect(screen.queryByText('Students')).toBeNull();
    expect(screen.queryByText('Groups')).toBeNull();
    expect(screen.queryByText('Scenarios')).toBeNull();
  });

  it('always shows Settings', () => {
    renderNav('solo_student');
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('collapse toggle hides labels', () => {
    renderNav('coach');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/SideNav.new.test.jsx`
Expected: FAIL

- [ ] **Step 3: Create SideNav composition root**

```jsx
// client/src/components/SideNav/SideNav.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  Home, Table2, Trophy, Clock, Medal,
  Users, FolderOpen, Target,
  Settings, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { colors } from '../../lib/colors.js';
import { useSidebarState } from './useSidebarState.js';
import SidebarHeader from './SidebarHeader.jsx';
import NavGroup from './NavGroup.jsx';
import NavItem from './NavItem.jsx';

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

const HOME_ITEMS = [
  { icon: Home,   label: 'Dashboard',   path: '/dashboard' },
  { icon: Table2, label: 'Tables',      path: '/tables' },
  { icon: Trophy, label: 'Tournaments', path: '/tournaments' },
  { icon: Clock,  label: 'History',     path: '/history' },
  { icon: Medal,  label: 'Leaderboard', path: '/leaderboard' },
];

const COACHING_ITEMS = [
  { icon: Users,      label: 'Students',  path: '/students',    badgeKey: 'students' },
  { icon: FolderOpen, label: 'Groups',    path: '/groups' },
  { icon: Target,     label: 'Scenarios', path: '/admin/hands' },
];

export default function SideNav({ chipBalance, badges = {}, schoolName, studentsOnline, activeTables }) {
  const { user } = useAuth();
  const location = useLocation();
  const { expanded, toggle } = useSidebarState();
  const role = user?.role;
  const showCoaching = COACH_ROLES.has(role);

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav
      className="flex flex-col shrink-0 h-full overflow-y-auto overflow-x-hidden"
      style={{
        width: expanded ? 220 : 56,
        background: colors.bgSurface,
        borderRight: `1px solid ${colors.borderDefault}`,
        transition: 'width 0.15s ease',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3" style={{ minHeight: 48 }}>
        <span className="text-base" style={{ color: colors.gold }}>♠</span>
        {expanded && (
          <span className="text-sm font-bold tracking-wide" style={{ color: colors.gold }}>
            Holdem Hub
          </span>
        )}
      </div>

      {/* User info + chips */}
      <SidebarHeader
        expanded={expanded}
        chipBalance={chipBalance}
        schoolName={schoolName}
        studentsOnline={studentsOnline}
        activeTables={activeTables}
      />

      {/* HOME */}
      <NavGroup label="HOME" expanded={expanded}>
        {HOME_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            path={item.path}
            expanded={expanded}
            active={isActive(item.path)}
            badge={item.badgeKey ? badges[item.badgeKey] : false}
          />
        ))}
      </NavGroup>

      {/* COACHING — coach+ only */}
      {showCoaching && (
        <NavGroup label="COACHING" expanded={expanded}>
          {COACHING_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              expanded={expanded}
              active={isActive(item.path)}
              badge={item.badgeKey ? badges[item.badgeKey] : false}
            />
          ))}
        </NavGroup>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: Settings + Collapse toggle */}
      <div className="flex flex-col gap-0.5 pb-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
        <NavItem
          icon={Settings}
          label="Settings"
          path="/settings"
          expanded={expanded}
          active={isActive('/settings')}
        />
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 transition-colors"
          style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          {expanded && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
```

```js
// client/src/components/SideNav/index.js
export { default } from './SideNav.jsx';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/SideNav.new.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/ client/src/__tests__/SideNav.new.test.jsx
git commit -m "feat(ui): add new SideNav with role-based groups and collapse"
```

---

### Task 10: Rewrite AppLayout + Update App.jsx Routes

Wire the new SideNav into AppLayout, remove GlobalTopBar, add new routes and redirects.

**Files:**
- Modify: `client/src/components/AppLayout.jsx`
- Modify: `client/src/App.jsx`
- Rename: `client/src/components/SideNav.jsx` → keep as backup, import from `SideNav/index.js`
- Test: `client/src/__tests__/AppRouting.test.jsx` (update)

- [ ] **Step 1: Rewrite AppLayout.jsx**

Replace the entire file:

```jsx
// client/src/components/AppLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { ToastProvider } from '../contexts/ToastContext.jsx';
import ToastContainer from './ToastContainer.jsx';
import SideNav from './SideNav/index.js';
import { colors } from '../lib/colors.js';

export default function AppLayout() {
  const { user } = useAuth();
  const { activeTables } = useLobby();

  // TODO Phase 3+: wire real chipBalance, schoolName, badges from API
  const chipBalance = null;
  const badges = {};

  return (
    <ToastProvider>
      <div className="flex" style={{ height: '100vh', background: colors.bgPrimary }}>
        <SideNav
          chipBalance={chipBalance}
          badges={badges}
          activeTables={activeTables?.length ?? 0}
        />
        <main className="flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Update App.jsx — add new routes and redirects**

In `client/src/App.jsx`, apply these changes:

1. Add imports for new pages at top (DashboardPage, TablesPage — these will be created in Phase 3, use placeholder stubs for now):

```jsx
// Add after existing page imports
// Phase 3 pages — placeholder stubs until Task 12+13
const DashboardPage = React.lazy(() => import('./pages/DashboardPage.jsx'));
const TablesPage = React.lazy(() => import('./pages/TablesPage.jsx'));
```

Actually, simpler: create minimal stub files first (see Step 3), then update routes.

2. Replace the route tree inside `<Route element={<AppLayout />}>`:

Replace the block from `<Route element={<AppLayout />}>` to its closing `</Route>` with:

```jsx
<Route element={<AppLayout />}>
  {/* Core pages */}
  <Route path="/dashboard"    element={<DashboardPage />} />
  <Route path="/tables"       element={<TablesPage />} />
  <Route path="/settings"     element={<SettingsPage />} />
  <Route path="/tournaments"                   element={<TournamentListPage />} />
  <Route path="/tournaments/:groupId"          element={<TournamentDetailPage />} />
  <Route path="/tournaments/:groupId/control"  element={<TournamentControlPage />} />
  <Route path="/leaderboard"  element={<LeaderboardPage />} />
  <Route path="/history"      element={<HandHistoryPage />} />
  <Route path="/staking"      element={<StakingPlayerPage />} />

  {/* Coach/Admin pages */}
  <Route path="/students"     element={<StudentsRosterPage />} />
  <Route path="/students/:playerId" element={<StudentDashboardPage />} />

  <Route element={<RequirePermission permission="admin:access" />}>
    <Route path="/admin/users"       element={<UserManagement />} />
    <Route path="/admin/hands"       element={<HandBuilder />} />
    <Route path="/admin/tournaments" element={<TournamentSetup />} />
    <Route path="/admin/referee"     element={<RefereeDashboard />} />
    <Route path="/admin/alerts"      element={<CoachAlertsPage />} />
    <Route path="/admin/staking"     element={<StakingPage />} />
    <Route path="/admin/tournaments/group/:groupId/balancer" element={<TournamentBalancer />} />
  </Route>

  {/* Redirects */}
  <Route path="/lobby"        element={<Navigate to="/dashboard" replace />} />
  <Route path="/admin/crm"    element={<Navigate to="/students" replace />} />
  <Route path="/admin/stable" element={<Navigate to="/students" replace />} />
  <Route path="/bot-lobby"    element={<Navigate to="/tables?filter=bot" replace />} />
  <Route path="/analysis"     element={<Navigate to="/students" replace />} />
</Route>
```

3. Add imports for stub pages:

```jsx
import DashboardPage from './pages/DashboardPage.jsx';
import TablesPage from './pages/TablesPage.jsx';
// Stubs for Phase 4 — will be replaced
const StudentsRosterPage = () => <div>Students — coming soon</div>;
const StudentDashboardPage = () => <div>Student Dashboard — coming soon</div>;
```

4. Remove `LobbyPage` and `BotLobbyPage` imports (they're replaced by the redirects + new pages).

5. Update the wildcard redirect:

```jsx
<Route path="*" element={<Navigate to="/dashboard" replace />} />
```

6. Update `RequirePermission` to redirect to `/dashboard` instead of `/lobby`:

```jsx
if (!hasPermission(permission)) return <Navigate to="/dashboard" replace />;
```

- [ ] **Step 3: Create stub pages for DashboardPage and TablesPage**

```jsx
// client/src/pages/DashboardPage.jsx
import React from 'react';
import { colors } from '../lib/colors.js';

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Dashboard</h1>
      <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Coming in Phase 3.</p>
    </div>
  );
}
```

```jsx
// client/src/pages/TablesPage.jsx
import React from 'react';
import { colors } from '../lib/colors.js';

export default function TablesPage() {
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Tables</h1>
      <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Coming in Phase 3.</p>
    </div>
  );
}
```

- [ ] **Step 4: Rename old SideNav to avoid conflict**

```bash
mv client/src/components/SideNav.jsx client/src/components/SideNav.old.jsx
```

- [ ] **Step 5: Run build to verify no errors**

Run: `cd client && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Run existing tests to check for regressions**

Run: `cd client && npx vitest run`
Expected: Check output. Some tests that import old `SideNav.jsx` or `GlobalTopBar.jsx` may need updating. Fix any failures.

- [ ] **Step 7: Update broken test imports**

Tests referencing `../components/SideNav` or `../components/GlobalTopBar` need mock updates. In `AppRouting.test.jsx`, update the mock for SideNav to point to the new path:

```js
// Replace:
// vi.mock('../components/SideNav', ...)
// With:
vi.mock('../components/SideNav/index.js', () => ({ default: () => <div>SideNav</div> }))
```

Remove or update any mock for `GlobalTopBar`.

- [ ] **Step 8: Verify all tests pass**

Run: `cd client && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): wire new SideNav + AppLayout, add routes and redirects"
```

---

## Phase 3 — Dashboard + Tables

### Task 11: Extract CreateTableModal

Extract the `CreateTableModal` function from `LobbyPage.jsx` (lines 126-447) into its own file. This is a mechanical extraction — no logic changes.

**Files:**
- Create: `client/src/components/tables/CreateTableModal.jsx`
- Test: existing `LobbyPage.test.jsx` tests cover this — verify they still pass after extraction

- [ ] **Step 1: Create the component file**

Copy the `CreateTableModal` function (lines 126-447 of LobbyPage.jsx) into `client/src/components/tables/CreateTableModal.jsx`. Add necessary imports at top:

```jsx
// client/src/components/tables/CreateTableModal.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';

const MODE_OPTIONS = [
  { value: 'coached_cash',   label: 'Coached Cash' },
  { value: 'uncoached_cash', label: 'Auto Cash' },
];

const PRIVACY_OPTIONS = [
  { value: 'open',    label: 'Open',    desc: 'Anyone can join' },
  { value: 'school',  label: 'School',  desc: 'Same school only' },
  { value: 'private', label: 'Private', desc: 'Invitation only' },
];

// Paste the full CreateTableModal function body from LobbyPage.jsx lines 126-447
// Replace hardcoded GOLD constant with colors.gold
// Export as default
export default function CreateTableModal({ onClose, onCreated }) {
  // ... (exact copy from LobbyPage.jsx, replacing GOLD with colors.gold)
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd client && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tables/CreateTableModal.jsx
git commit -m "refactor(ui): extract CreateTableModal from LobbyPage"
```

---

### Task 12: Extract BuyInModal

**Files:**
- Create: `client/src/components/tables/BuyInModal.jsx`

- [ ] **Step 1: Create the component file**

Copy `BuyInModal` function (LobbyPage.jsx lines 451-527) into `client/src/components/tables/BuyInModal.jsx`. Add imports, replace `GOLD` with `colors.gold`, export as default.

- [ ] **Step 2: Verify build**

Run: `cd client && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tables/BuyInModal.jsx
git commit -m "refactor(ui): extract BuyInModal from LobbyPage"
```

---

### Task 13: Build DashboardPage

Replace the stub with the real implementation. Uses data-fetching patterns from LobbyPage.

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`
- Create: `client/src/components/dashboard/QuickLinks.jsx`
- Create: `client/src/components/dashboard/QuickStats.jsx`
- Create: `client/src/components/dashboard/AlertFeed.jsx`
- Create: `client/src/components/dashboard/ActiveTables.jsx`
- Test: `client/src/__tests__/DashboardPage.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/DashboardPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../contexts/LobbyContext.jsx', () => ({
  useLobby: () => ({ activeTables: [], refreshTables: vi.fn() }),
}));

vi.mock('../lib/api.js', () => ({
  apiFetch: () => Promise.resolve({}),
}));

import { useAuth } from '../contexts/AuthContext.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';

function renderPage(role = 'coach') {
  useAuth.mockReturnValue({
    user: { id: 'u1', name: 'Jo', role },
    hasPermission: () => true,
  });
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  it('renders page title', () => {
    renderPage('coach');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('shows quick links for coaches', () => {
    renderPage('coach');
    expect(screen.getByText('Create Table')).toBeTruthy();
    expect(screen.getByText('Students')).toBeTruthy();
  });

  it('shows student-specific links for students', () => {
    renderPage('coached_student');
    expect(screen.getByText('Join Table')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/DashboardPage.test.jsx`
Expected: FAIL (stub page doesn't have the expected content)

- [ ] **Step 3: Create sub-components**

Create `client/src/components/dashboard/QuickLinks.jsx`:

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../lib/colors.js';
import { Plus, Users, Target, Table2, Bot, Clock } from 'lucide-react';

const COACH_LINKS = [
  { icon: Plus,   label: 'Create Table', path: '/tables', state: { openCreate: true } },
  { icon: Users,  label: 'Students',     path: '/students' },
  { icon: Target, label: 'Scenarios',    path: '/admin/hands' },
];

const STUDENT_LINKS = [
  { icon: Table2, label: 'Join Table',   path: '/tables' },
  { icon: Bot,    label: 'Bot Practice', path: '/tables?filter=bot' },
  { icon: Clock,  label: 'History',      path: '/history' },
];

export default function QuickLinks({ isCoach }) {
  const navigate = useNavigate();
  const links = isCoach ? COACH_LINKS : STUDENT_LINKS;

  return (
    <div className="grid grid-cols-3 gap-3">
      {links.map((link) => (
        <button
          key={link.label}
          onClick={() => navigate(link.path, { state: link.state })}
          className="flex flex-col items-center gap-2 p-4 rounded-lg transition-colors"
          style={{
            background: colors.bgSurfaceRaised,
            border: `1px solid ${colors.borderDefault}`,
          }}
        >
          <link.icon size={20} style={{ color: colors.gold }} />
          <span className="text-xs font-medium" style={{ color: colors.textPrimary }}>
            {link.label}
          </span>
        </button>
      ))}
    </div>
  );
}
```

Create `client/src/components/dashboard/QuickStats.jsx`:

```jsx
import React from 'react';
import { colors } from '../../lib/colors.js';

function StatPill({ label, value }) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg flex-1 min-w-0"
      style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderDefault}` }}
    >
      <span className="text-sm font-bold tabular-nums" style={{ color: colors.textPrimary }}>
        {value ?? '—'}
      </span>
      <span className="text-xs text-center" style={{ color: colors.textSecondary }}>
        {label}
      </span>
    </div>
  );
}

export default function QuickStats({ stats }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {stats.map((s, i) => (
        <StatPill key={i} label={s.label} value={s.value} />
      ))}
    </div>
  );
}
```

Create `client/src/components/dashboard/AlertFeed.jsx` — copy the `AlertFeedWidget` function from LobbyPage.jsx (lines 531-577), refactored to use colors tokens.

Create `client/src/components/dashboard/ActiveTables.jsx`:

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../lib/colors.js';

export default function ActiveTables({ tables }) {
  const navigate = useNavigate();
  const top = (tables ?? []).slice(0, 3);

  if (top.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
          Active Tables
        </h2>
        <button
          onClick={() => navigate('/tables')}
          className="text-xs transition-colors"
          style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          View All →
        </button>
      </div>
      <div className="flex gap-3">
        {top.map((t) => (
          <div
            key={t.id ?? t.tableId}
            onClick={() => navigate(`/table/${t.id ?? t.tableId}`)}
            className="flex-1 p-3 rounded-lg cursor-pointer transition-colors"
            style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderDefault}` }}
          >
            <span className="text-sm font-medium block" style={{ color: colors.textPrimary }}>
              {t.name ?? `Table ${t.id}`}
            </span>
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {t.playerCount ?? t.player_count ?? 0} players
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Build the real DashboardPage**

```jsx
// client/src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { apiFetch } from '../lib/api.js';
import { colors } from '../lib/colors.js';
import QuickLinks from '../components/dashboard/QuickLinks.jsx';
import QuickStats from '../components/dashboard/QuickStats.jsx';
import AlertFeed from '../components/dashboard/AlertFeed.jsx';
import ActiveTables from '../components/dashboard/ActiveTables.jsx';

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

function fmtStat(v, pct = false) {
  if (v == null) return '—';
  return pct ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString();
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeTables } = useLobby();
  const role = user?.role;
  const userId = user?.id;
  const isCoach = COACH_ROLES.has(role);

  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/api/players/${userId}/stats`).then(setStats).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!isCoach) return;
    apiFetch('/api/coach/alerts')
      .then((d) => setAlerts(d?.alerts ?? d ?? []))
      .catch(() => {});
  }, [isCoach]);

  const coachStats = [
    { label: 'Active Tables', value: activeTables?.length ?? 0 },
    { label: 'Students Online', value: stats?.students_online ?? '—' },
    { label: 'Hands / Week', value: fmtStat(stats?.hands_this_week) },
    { label: 'Avg Grade', value: stats?.avg_grade ?? '—' },
  ];

  const studentStats = [
    { label: 'VPIP', value: fmtStat(stats?.vpip, true) },
    { label: 'PFR', value: fmtStat(stats?.pfr, true) },
    { label: 'Hands Played', value: fmtStat(stats?.hands_played) },
    { label: 'Rank', value: '—' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
        Dashboard
      </h1>
      <QuickLinks isCoach={isCoach} />
      <QuickStats stats={isCoach ? coachStats : studentStats} />
      <ActiveTables tables={activeTables} />
      {isCoach && <AlertFeed alerts={alerts} />}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/DashboardPage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DashboardPage.jsx client/src/components/dashboard/ client/src/__tests__/DashboardPage.test.jsx
git commit -m "feat(ui): build DashboardPage with role-adaptive widgets"
```

---

### Task 14: Build TablesPage

Full table browser with filter tabs including bot. Reuses extracted CreateTableModal and BuyInModal.

**Files:**
- Modify: `client/src/pages/TablesPage.jsx`
- Test: `client/src/__tests__/TablesPage.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/TablesPage.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'coach' }, hasPermission: () => true }),
}));

vi.mock('../contexts/LobbyContext.jsx', () => ({
  useLobby: () => ({ activeTables: [], refreshTables: vi.fn() }),
}));

vi.mock('../lib/api.js', () => ({ apiFetch: () => Promise.resolve({}) }));

// Stub modals
vi.mock('../components/tables/CreateTableModal.jsx', () => ({ default: () => null }));
vi.mock('../components/tables/BuyInModal.jsx', () => ({ default: () => null }));
vi.mock('../pages/admin/TournamentSetup.jsx', () => ({ WizardModal: () => null }));

import TablesPage from '../pages/TablesPage.jsx';

describe('TablesPage', () => {
  it('renders filter tabs', () => {
    render(<MemoryRouter><TablesPage /></MemoryRouter>);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Tournament')).toBeTruthy();
    expect(screen.getByText('Bot Practice')).toBeTruthy();
  });

  it('renders page title', () => {
    render(<MemoryRouter><TablesPage /></MemoryRouter>);
    expect(screen.getByText('Tables')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Build TablesPage**

Rewrite `client/src/pages/TablesPage.jsx` using the tables section logic from LobbyPage (lines 707-773) plus filter tabs, CreateTableModal, BuyInModal, and table action handlers (lines 843-884).

The key parts to bring over from LobbyPage:
- `mapTableToCard` helper (lines 51-93)
- `filterTables` helper (lines 95-111) — add `'bot'` case: `return tables.filter(t => t.mode === 'bot_cash')`
- `COACH_TABLE_TABS` / `STUDENT_TABLE_TABS` — add Bot Practice tab to both
- Table grid rendering
- Action handlers (navigate to table, buy-in flow)

Keep under 200 lines by importing CreateTableModal and BuyInModal.

- [ ] **Step 3: Run test**

Run: `cd client && npx vitest run src/__tests__/TablesPage.test.jsx`
Expected: PASS

- [ ] **Step 4: Run full build**

Run: `cd client && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TablesPage.jsx client/src/__tests__/TablesPage.test.jsx
git commit -m "feat(ui): build TablesPage with filter tabs including bot"
```

---

### Task 15: Phase 3 Verification

- [ ] **Step 1: Run full test suite**

Run: `cd client && npx vitest run`
Expected: All pass

- [ ] **Step 2: Run build**

Run: `cd client && npx vite build`
Expected: Zero errors

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix(ui): phase 3 test/build fixes"
```

---

## Phase 4 — CRM Overhaul

### Task 16: Enhance CollapsibleSection with localStorage

The existing `CollapsibleSection` works but doesn't persist state. Add an optional `storageKey` prop.

**Files:**
- Modify: `client/src/components/CollapsibleSection.jsx`
- Modify: `client/src/__tests__/CollapsibleSection.test.jsx`

- [ ] **Step 1: Add test for localStorage persistence**

Add to `client/src/__tests__/CollapsibleSection.test.jsx`:

```jsx
describe('CollapsibleSection — localStorage persistence', () => {
  beforeEach(() => { localStorage.clear(); });

  it('persists collapsed state when storageKey is provided', () => {
    const { unmount } = render(
      <CollapsibleSection title="PERSIST" storageKey="test-section" defaultOpen={true}>
        <div data-testid="content">Content</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByText('PERSIST'));
    expect(localStorage.getItem('section-test-section')).toBe('false');
    unmount();

    // Re-render — should start collapsed
    render(
      <CollapsibleSection title="PERSIST" storageKey="test-section" defaultOpen={true}>
        <div data-testid="content">Content</div>
      </CollapsibleSection>
    );
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('ignores localStorage when no storageKey', () => {
    render(
      <CollapsibleSection title="NO KEY" defaultOpen={true}>
        <div data-testid="content">Content</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByText('NO KEY'));
    expect(localStorage.getItem('section-undefined')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/CollapsibleSection.test.jsx`
Expected: FAIL — new tests fail

- [ ] **Step 3: Update CollapsibleSection**

```jsx
// client/src/components/CollapsibleSection.jsx
import React, { useState } from 'react';
import { colors } from '../lib/colors.js';
import { ChevronRight } from 'lucide-react';

function getInitialOpen(storageKey, defaultOpen) {
  if (storageKey) {
    const stored = localStorage.getItem(`section-${storageKey}`);
    if (stored !== null) return stored === 'true';
  }
  return defaultOpen;
}

export default function CollapsibleSection({ title, children, defaultOpen = true, storageKey, headerExtra = null, onToggle = null }) {
  const [open, setOpen] = useState(() => getInitialOpen(storageKey, defaultOpen));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) localStorage.setItem(`section-${storageKey}`, String(next));
    if (onToggle) onToggle(next);
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderDefault}` }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={toggle}
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-expanded={open}
        >
          <ChevronRight
            size={14}
            style={{
              color: colors.textMuted,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          />
          <span className="text-sm font-semibold" style={{ color: colors.gold }}>
            {title}
          </span>
        </button>
        {headerExtra}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/CollapsibleSection.test.jsx`
Expected: PASS

- [ ] **Step 5: Run full suite for regressions**

Run: `cd client && npx vitest run`
Expected: PASS (check that other tests using CollapsibleSection still work)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/CollapsibleSection.jsx client/src/__tests__/CollapsibleSection.test.jsx
git commit -m "feat(ui): add localStorage persistence to CollapsibleSection"
```

---

### Task 17: StudentsRosterPage

The roster list page replacing PlayerCRM's main view.

**Files:**
- Create: `client/src/pages/StudentsRosterPage.jsx`
- Test: `client/src/__tests__/StudentsRosterPage.test.jsx`

- [ ] **Step 1: Write the test**

```jsx
// client/src/__tests__/StudentsRosterPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'c1', role: 'coach' }, hasPermission: () => true }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({ apiFetch: (...args) => mockApiFetch(...args) }));

import StudentsRosterPage from '../pages/StudentsRosterPage.jsx';

beforeEach(() => { mockApiFetch.mockReset(); });

describe('StudentsRosterPage', () => {
  it('renders page title', async () => {
    mockApiFetch.mockResolvedValue({ players: [] });
    render(<MemoryRouter><StudentsRosterPage /></MemoryRouter>);
    expect(screen.getByText('Students')).toBeTruthy();
  });

  it('shows empty state when no students', async () => {
    mockApiFetch.mockResolvedValue({ players: [] });
    render(<MemoryRouter><StudentsRosterPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/no students/i)).toBeTruthy();
    });
  });

  it('renders student rows', async () => {
    mockApiFetch.mockResolvedValue({
      players: [
        { id: 'p1', display_name: 'Ariela', group_name: 'Sharks', grade: 78, last_active: new Date().toISOString() },
      ],
    });
    render(<MemoryRouter><StudentsRosterPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Ariela')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/StudentsRosterPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: Build StudentsRosterPage**

Build `client/src/pages/StudentsRosterPage.jsx` — a data table page that fetches students via `GET /api/admin/crm` (existing endpoint used by PlayerCRM), renders columns (Name, Group, Grade, Alert, Last Active), with search filter and group dropdown filter. Row click navigates to `/students/:playerId`. Include loading skeleton, empty state, and error state. Keep under 200 lines.

Reference the data-fetching pattern from PlayerCRM's `StableTab` (line 1953) and the existing `apiFetch('/api/admin/crm')` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/StudentsRosterPage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/StudentsRosterPage.jsx client/src/__tests__/StudentsRosterPage.test.jsx
git commit -m "feat(ui): add StudentsRosterPage with data table"
```

---

### Task 18: StudentDashboardPage + Section Components

The student detail page with collapsible cards. This is the largest task — creates the page shell and initial section components.

**Files:**
- Create: `client/src/pages/StudentDashboardPage.jsx`
- Create: `client/src/components/crm/PlayerHeader.jsx`
- Create: `client/src/components/crm/OverviewSection.jsx`
- Create: `client/src/components/crm/PerformanceSection.jsx`
- Create: `client/src/components/crm/MistakesSection.jsx`
- Create: `client/src/components/crm/HandsSection.jsx`
- Create: `client/src/components/crm/AlertsSection.jsx`
- Create: `client/src/components/crm/NotesSection.jsx`
- Create: `client/src/components/crm/StakingSection.jsx`
- Create: `client/src/components/crm/GroupsSection.jsx`
- Create: `client/src/components/crm/PrepBriefSection.jsx`
- Create: `client/src/components/crm/ReportsSection.jsx`
- Create: `client/src/components/crm/ScenariosSection.jsx`
- Test: `client/src/__tests__/StudentDashboardPage.test.jsx`

**Strategy:** This is too large for one step. Break into sub-steps:

- [ ] **Step 1: Write test for page shell**

```jsx
// client/src/__tests__/StudentDashboardPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'c1', role: 'coach' }, hasPermission: () => true }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({ apiFetch: (...args) => mockApiFetch(...args) }));

import StudentDashboardPage from '../pages/StudentDashboardPage.jsx';

function renderPage(playerId = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/students/${playerId}`]}>
      <Routes>
        <Route path="/students/:playerId" element={<StudentDashboardPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation((path) => {
    if (path.includes('/crm/')) return Promise.resolve({
      player: { id: 'p1', display_name: 'Ariela', role: 'coached_student' },
      summary: { hands_played: 100, vpip: 25, pfr: 18, wtsd: 30 },
    });
    return Promise.resolve({});
  });
});

describe('StudentDashboardPage', () => {
  it('renders breadcrumb with player name', async () => {
    renderPage('p1');
    await waitFor(() => {
      expect(screen.getByText(/Ariela/)).toBeTruthy();
    });
  });

  it('renders collapsible section titles', async () => {
    renderPage('p1');
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeTruthy();
      expect(screen.getByText('Performance')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Create PlayerHeader**

```jsx
// client/src/components/crm/PlayerHeader.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../lib/colors.js';
import { ArrowLeft } from 'lucide-react';

export default function PlayerHeader({ player, groupName }) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={() => navigate('/students')}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <ArrowLeft size={14} />
        Students
      </button>
      {groupName && (
        <>
          <span style={{ color: colors.textMuted }}>/</span>
          <span className="text-xs" style={{ color: colors.textMuted }}>{groupName}</span>
        </>
      )}
      <span style={{ color: colors.textMuted }}>/</span>
      <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
        {player?.display_name ?? 'Student'}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create section component stubs**

Each section component in `client/src/components/crm/` follows the same pattern: accepts `playerId` prop, fetches its own data, renders inside a `CollapsibleSection`. Create all 12 as functional stubs that can be fleshed out incrementally:

For each file (`OverviewSection.jsx`, `PerformanceSection.jsx`, `MistakesSection.jsx`, `HandsSection.jsx`, `AlertsSection.jsx`, `NotesSection.jsx`, `StakingSection.jsx`, `GroupsSection.jsx`, `PrepBriefSection.jsx`, `ReportsSection.jsx`, `ScenariosSection.jsx`):

```jsx
// Example: client/src/components/crm/OverviewSection.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';
import CollapsibleSection from '../CollapsibleSection.jsx';

export default function OverviewSection({ playerId, summary }) {
  return (
    <CollapsibleSection title="Overview" storageKey={`crm-overview-${playerId}`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Hands', value: summary?.hands_played ?? '—' },
          { label: 'VPIP', value: summary?.vpip != null ? `${Number(summary.vpip).toFixed(1)}%` : '—' },
          { label: 'PFR', value: summary?.pfr != null ? `${Number(summary.pfr).toFixed(1)}%` : '—' },
          { label: 'WTSD', value: summary?.wtsd != null ? `${Number(summary.wtsd).toFixed(1)}%` : '—' },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center p-3 rounded-lg" style={{ background: colors.bgSurface }}>
            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{s.value}</span>
            <span className="text-xs" style={{ color: colors.textSecondary }}>{s.label}</span>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
```

Each remaining section follows a similar pattern — wrap content in `CollapsibleSection` with `storageKey`. The section's internal data fetching and rendering can be ported from the corresponding tab in PlayerCRM (e.g., `NotesSection` from `NotesTab` at line 1164, `StakingSection` from `StakingTab` at line 813, etc.).

- [ ] **Step 4: Create StudentDashboardPage**

```jsx
// client/src/pages/StudentDashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { colors } from '../lib/colors.js';
import PlayerHeader from '../components/crm/PlayerHeader.jsx';
import OverviewSection from '../components/crm/OverviewSection.jsx';
import PerformanceSection from '../components/crm/PerformanceSection.jsx';
import MistakesSection from '../components/crm/MistakesSection.jsx';
import HandsSection from '../components/crm/HandsSection.jsx';
import AlertsSection from '../components/crm/AlertsSection.jsx';
import NotesSection from '../components/crm/NotesSection.jsx';
import StakingSection from '../components/crm/StakingSection.jsx';
import GroupsSection from '../components/crm/GroupsSection.jsx';
import PrepBriefSection from '../components/crm/PrepBriefSection.jsx';
import ReportsSection from '../components/crm/ReportsSection.jsx';
import ScenariosSection from '../components/crm/ScenariosSection.jsx';

export default function StudentDashboardPage() {
  const { playerId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/admin/crm/${playerId}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl" aria-busy="true">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg" style={{ background: colors.bgSurfaceRaised }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl">
        <p className="text-sm" style={{ color: colors.error }}>Failed to load student data: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs mt-2 px-3 py-1 rounded"
          style={{ background: colors.bgSurfaceRaised, color: colors.textPrimary, border: `1px solid ${colors.borderDefault}` }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { player, summary } = data ?? {};

  return (
    <div className="p-6 max-w-6xl">
      <PlayerHeader player={player} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverviewSection playerId={playerId} summary={summary} />
        <AlertsSection playerId={playerId} />
        <PerformanceSection playerId={playerId} />
        <GroupsSection playerId={playerId} />
        <MistakesSection playerId={playerId} />
        <StakingSection playerId={playerId} />
        <HandsSection playerId={playerId} />
        <ReportsSection playerId={playerId} />
        <NotesSection playerId={playerId} />
        <ScenariosSection playerId={playerId} />
        <PrepBriefSection playerId={playerId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test**

Run: `cd client && npx vitest run src/__tests__/StudentDashboardPage.test.jsx`
Expected: PASS

- [ ] **Step 6: Run build**

Run: `cd client && npx vite build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/StudentDashboardPage.jsx client/src/pages/StudentsRosterPage.jsx client/src/components/crm/ client/src/__tests__/StudentDashboardPage.test.jsx
git commit -m "feat(ui): add StudentDashboardPage with collapsible section cards"
```

---

### Task 19: Wire CRM Routes in App.jsx

Replace the inline stubs with real imports.

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Update imports in App.jsx**

Replace the inline stubs:
```jsx
// Remove these lines:
const StudentsRosterPage = () => <div>Students — coming soon</div>;
const StudentDashboardPage = () => <div>Student Dashboard — coming soon</div>;

// Add proper imports:
import StudentsRosterPage from './pages/StudentsRosterPage.jsx';
import StudentDashboardPage from './pages/StudentDashboardPage.jsx';
```

Also: move `/students` and `/students/:playerId` routes outside the `RequirePermission` wrapper (they need coach access, not admin:access). They already are in the route tree from Task 10 — verify they're NOT inside the `<RequirePermission permission="admin:access">` block.

- [ ] **Step 2: Run build**

Run: `cd client && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Run full test suite**

Run: `cd client && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(ui): wire StudentsRosterPage + StudentDashboardPage routes"
```

---

## Phase 5 — Cleanup + Verification

### Task 20: Remove Dead Code

**Files:**
- Delete: `client/src/components/SideNav.old.jsx` (backed up in Task 10)
- Delete: `client/src/components/GlobalTopBar.jsx`
- Verify: no imports reference these files

- [ ] **Step 1: Search for remaining imports**

Run: `grep -r "SideNav.old" client/src/ && grep -r "GlobalTopBar" client/src/`
Expected: No matches (or only in test mocks that need updating)

- [ ] **Step 2: Delete files**

```bash
rm client/src/components/SideNav.old.jsx
rm client/src/components/GlobalTopBar.jsx
```

- [ ] **Step 3: Fix any broken imports**

Update any test mocks that still reference GlobalTopBar or old SideNav.

- [ ] **Step 4: Run build + tests**

Run: `cd client && npx vite build && npx vitest run`
Expected: Both pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ui): remove old SideNav and GlobalTopBar"
```

---

### Task 21: Final Verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 3: Visual spot-check checklist**

Start dev server: `npm run dev` (or `cd client && npx vite`)

Manually verify at 1440px:
- [ ] Sidebar shows 9 items for coach, 6 for student
- [ ] Sidebar collapse toggle works, state persists after refresh
- [ ] `/dashboard` shows role-appropriate content
- [ ] `/tables` shows filter tabs including Bot Practice
- [ ] `/students` shows roster with search
- [ ] `/students/:id` shows collapsible cards
- [ ] `/lobby` redirects to `/dashboard`
- [ ] `/admin/crm` redirects to `/students`
- [ ] `/bot-lobby` redirects to `/tables?filter=bot`
- [ ] Settings accessible from sidebar (all roles)
- [ ] Toast visible via `useToast()` from any page

- [ ] **Step 4: Final commit if any spot-check fixes**

```bash
git add -A && git commit -m "fix(ui): post-verification polish"
```

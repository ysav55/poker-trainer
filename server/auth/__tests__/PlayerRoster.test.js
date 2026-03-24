'use strict';

/**
 * PlayerRoster unit tests
 *
 * fs is mocked so no disk access occurs. bcrypt is mocked so tests run fast
 * and remain focused on PlayerRoster logic (parsing, lookup, deduplication)
 * rather than on cryptographic behaviour. authenticate() is async.
 */

const path = require('path');

// ── Mock bcrypt: compare(plain, hash) resolves true when plain === hash.
//    This lets tests keep plain-text passwords in CSV strings while still
//    exercising the full authenticate() code path. ─────────────────────────
jest.mock('bcrypt', () => ({
  compare: jest.fn((plain, hash) => Promise.resolve(plain === hash)),
}));

// ── Mock fs before requiring PlayerRoster ─────────────────────────────────
jest.mock('fs');
const fs = require('fs');

// Helper: reset module registry and re-require PlayerRoster with given CSV content.
function loadWith(csvContent, fileExists = true) {
  fs.existsSync.mockReturnValue(fileExists);
  fs.readFileSync.mockReturnValue(csvContent);
  jest.resetModules();
  // Re-mock fs + bcrypt after resetModules
  jest.mock('fs');
  jest.mock('bcrypt', () => ({
    compare: jest.fn((plain, hash) => Promise.resolve(plain === hash)),
  }));
  const freshFs = require('fs');
  freshFs.existsSync.mockReturnValue(fileExists);
  freshFs.readFileSync.mockReturnValue(csvContent);
  return require('../PlayerRoster');
}

// Suppress console noise in output
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
//  CSV parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV parsing — valid content', () => {
  test('parses a valid roster with coach and student', () => {
    const roster = loadWith('Alice,pass1,coach\nBob,pass2,student\n');
    expect(roster.getRole('Alice')).toBe('coach');
    expect(roster.getRole('Bob')).toBe('student');
  });

  test('strips whitespace around name, password, role fields', async () => {
    const roster = loadWith('  Alice  ,  pass1  ,  coach  \n');
    expect(roster.getRole('Alice')).toBe('coach');
    await expect(roster.authenticate('Alice', 'pass1')).resolves.not.toBeNull();
  });

  test('skips lines starting with #', () => {
    const roster = loadWith('# this is a comment\nBob,pass2,student\n');
    expect(roster.getRole('Bob')).toBe('student');
  });

  test('skips blank lines', () => {
    const roster = loadWith('\n\nCarol,pass3,student\n\n');
    expect(roster.getRole('Carol')).toBe('student');
  });

  test('role matching is case-insensitive (Coach → coach)', () => {
    const roster = loadWith('Dave,pass4,Coach\n');
    expect(roster.getRole('Dave')).toBe('coach');
  });

  test('role matching is case-insensitive (STUDENT → student)', () => {
    const roster = loadWith('Eve,pass5,STUDENT\n');
    expect(roster.getRole('Eve')).toBe('student');
  });

  test('name lookup is case-insensitive', () => {
    const roster = loadWith('Alice,pass1,coach\n');
    expect(roster.getRole('alice')).toBe('coach');
    expect(roster.getRole('ALICE')).toBe('coach');
  });

  test('multiple valid entries are all loaded', () => {
    const csv = 'A,p1,coach\nB,p2,student\nC,p3,student\n';
    const roster = loadWith(csv);
    expect(roster.getRole('A')).toBe('coach');
    expect(roster.getRole('B')).toBe('student');
    expect(roster.getRole('C')).toBe('student');
  });
});

describe('CSV parsing — malformed content', () => {
  test('skips rows with fewer than 3 columns and warns', () => {
    const roster = loadWith('Alice,pass1\nBob,pass2,student\n');
    expect(roster.getRole('Alice')).toBeNull();
    expect(roster.getRole('Bob')).toBe('student');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('malformed'));
  });

  test('skips rows with invalid role and warns', () => {
    const roster = loadWith('Alice,pass1,admin\nBob,pass2,student\n');
    expect(roster.getRole('Alice')).toBeNull();
    expect(roster.getRole('Bob')).toBe('student');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('invalid role'));
  });

  test('skips rows with empty name and warns', () => {
    const roster = loadWith(',pass1,coach\nBob,pass2,student\n');
    expect(roster.getRole('Bob')).toBe('student');
    expect(console.warn).toHaveBeenCalled();
  });

  test('duplicate name: last entry wins and warns', async () => {
    const roster = loadWith('Alice,first,student\nAlice,second,coach\n');
    expect(roster.getRole('Alice')).toBe('coach');
    await expect(roster.authenticate('Alice', 'second')).resolves.not.toBeNull();
    await expect(roster.authenticate('Alice', 'first')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate'));
  });
});

describe('load() — missing file', () => {
  test('calls process.exit(1) when players.csv is not found', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    expect(() => loadWith('', false)).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  authenticate()
// ─────────────────────────────────────────────────────────────────────────────

describe('authenticate()', () => {
  let roster;
  beforeEach(() => {
    roster = loadWith('Alice,mypass,coach\nBob,bobpass,student\n');
  });

  test('returns the roster record for correct credentials', async () => {
    const entry = await roster.authenticate('Alice', 'mypass');
    expect(entry).toMatchObject({ name: 'Alice', role: 'coach' });
  });

  test('returns null for unknown name', async () => {
    await expect(roster.authenticate('Nobody', 'anypass')).resolves.toBeNull();
  });

  test('returns null for wrong password (case-sensitive)', async () => {
    await expect(roster.authenticate('Alice', 'MyPass')).resolves.toBeNull();
    await expect(roster.authenticate('Alice', 'MYPASS')).resolves.toBeNull();
    await expect(roster.authenticate('Alice', 'mypass ')).resolves.toBeNull();
  });

  test('returns null when name is null', async () => {
    await expect(roster.authenticate(null, 'mypass')).resolves.toBeNull();
  });

  test('returns null when password is null', async () => {
    await expect(roster.authenticate('Alice', null)).resolves.toBeNull();
  });

  test('name matching is case-insensitive', async () => {
    await expect(roster.authenticate('alice', 'mypass')).resolves.not.toBeNull();
    await expect(roster.authenticate('ALICE', 'mypass')).resolves.not.toBeNull();
  });

  test('returns the canonical name from the CSV (preserving capitalisation)', async () => {
    const entry = await roster.authenticate('alice', 'mypass');
    expect(entry.name).toBe('Alice');  // canonical from CSV, not from input
  });

  test('password comparison is case-sensitive', async () => {
    await expect(roster.authenticate('Bob', 'bobpass')).resolves.not.toBeNull();
    await expect(roster.authenticate('Bob', 'Bobpass')).resolves.toBeNull();
    await expect(roster.authenticate('Bob', 'BOBPASS')).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  getRole()
// ─────────────────────────────────────────────────────────────────────────────

describe('getRole()', () => {
  let roster;
  beforeEach(() => {
    roster = loadWith('Alice,p,coach\nBob,p,student\n');
  });

  test('returns "coach" for a coach entry', () => {
    expect(roster.getRole('Alice')).toBe('coach');
  });

  test('returns "student" for a student entry', () => {
    expect(roster.getRole('Bob')).toBe('student');
  });

  test('returns null for a name not in the roster', () => {
    expect(roster.getRole('Nobody')).toBeNull();
  });

  test('returns null when name is null', () => {
    expect(roster.getRole(null)).toBeNull();
  });

  test('returns null when name is undefined', () => {
    expect(roster.getRole(undefined)).toBeNull();
  });

  test('lookup is case-insensitive', () => {
    expect(roster.getRole('alice')).toBe('coach');
    expect(roster.getRole('ALICE')).toBe('coach');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  reload()
// ─────────────────────────────────────────────────────────────────────────────

describe('reload()', () => {
  test('re-reads the file and updates the roster', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync
      .mockReturnValueOnce('Alice,p,student\n')  // initial load
      .mockReturnValueOnce('Alice,p,coach\n');    // after reload

    jest.resetModules();
    jest.mock('fs');
    jest.mock('bcrypt', () => ({
      compare: jest.fn((plain, hash) => Promise.resolve(plain === hash)),
    }));
    const freshFs = require('fs');
    freshFs.existsSync.mockReturnValue(true);
    freshFs.readFileSync
      .mockReturnValueOnce('Alice,p,student\n')
      .mockReturnValueOnce('Alice,p,coach\n');

    const roster = require('../PlayerRoster');
    expect(roster.getRole('Alice')).toBe('student');

    roster.reload();
    expect(roster.getRole('Alice')).toBe('coach');
  });
});

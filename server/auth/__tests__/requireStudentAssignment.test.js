'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockQueryResult = { data: null, error: null };

const mockMaybeSingle = jest.fn(async () => mockQueryResult);
const mockEq = jest.fn(() => ({ eq: mockEq, maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../db/supabase', () => ({ from: mockFrom }));

// ─── Module under test ────────────────────────────────────────────────────────

const requireStudentAssignment = require('../requireStudentAssignment');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(user, paramId) {
  return {
    params: { id: paramId },
    user,
  };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data) => { res.body = data; return res; };
  return res;
}

const COACH_ID   = 'coach-aaa';
const STUDENT_ID = 'student-bbb';
const OTHER_STUDENT = 'student-ccc';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryResult = { data: null, error: null };
});

describe('requireStudentAssignment', () => {
  test('calls next and sets req.studentId when student is assigned to coach', async () => {
    mockQueryResult = { data: { id: STUDENT_ID }, error: null };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
  });

  test('returns 403 when student is not assigned to coach', async () => {
    mockQueryResult = { data: null, error: null };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, OTHER_STUDENT);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('admin bypasses ownership check', async () => {
    const req  = makeReq({ id: 'admin-1', role: 'admin' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
    expect(mockFrom).not.toHaveBeenCalled(); // no DB query for admin
  });

  test('superadmin bypasses ownership check', async () => {
    const req  = makeReq({ id: 'sa-1', role: 'superadmin' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('returns 500 when DB query fails', async () => {
    mockQueryResult = { data: null, error: { message: 'db down' } };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});

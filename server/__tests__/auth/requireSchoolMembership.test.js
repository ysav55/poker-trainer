const { requireSchoolMembership } = require('../../auth/requireSchoolMembership');

describe('requireSchoolMembership', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: { id: 'player-1', school_id: 'school-1', role: 'coach' }, params: {}, query: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('coach accessing own school passes', () => {
    const middleware = requireSchoolMembership('school_id');
    req.params.school_id = 'school-1';
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('coach accessing different school returns 403', () => {
    const middleware = requireSchoolMembership('school_id');
    req.params.school_id = 'school-2';
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden', message: 'You do not belong to this school' });
    expect(next).not.toHaveBeenCalled();
  });

  test('admin accessing any school passes', () => {
    req.user.role = 'admin';
    const middleware = requireSchoolMembership('school_id');
    req.params.school_id = 'school-999';
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('extracts schoolId from query param if not in params', () => {
    const middleware = requireSchoolMembership('id', 'query');
    req.query.id = 'school-1';
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('unauthenticated user returns 401', () => {
    const middleware = requireSchoolMembership('school_id');
    delete req.user;
    req.params.school_id = 'school-1';
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

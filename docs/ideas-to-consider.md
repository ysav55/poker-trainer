# Ideas to Consider — Future Enhancements

This file tracks ideas and explorations for future work that are out of scope for the current phase but merit deeper investigation later.

---

## School Sub-Roles System

**Status:** Deferred (2026-04-15)

**Idea:** Allow schools to create and hold their own custom sub-roles within the school hierarchy, separate from the platform-wide role system (superadmin, admin, coach, coached_student, solo_student, trial).

**Why it matters:**
- Schools may want internal organizational roles (e.g., "assistant coach", "curriculum lead", "scholarship manager") without exposing them to the platform
- Sub-roles could have school-scoped permissions that don't affect other schools
- Allows flexibility without requiring platform-wide permission redesign

**Complexity considerations (to explore):**
1. **Scope isolation:** Sub-roles must be school-scoped, not global. How do we prevent role escaping?
2. **Permission inheritance:** Do sub-roles inherit from parent roles (e.g., "assistant coach" inherits all coach perms minus sensitive ones)?
3. **Storage:** New table `school_roles` with (id, school_id, name, permissions_json) + junction table `player_school_roles`?
4. **Auth layer:** Does `requireRole()` become `requireRole(role, schoolId?)`? How does it handle fallback to global roles?
5. **RLS complexity:** RLS policies become harder if sub-roles need school-specific filtering — test thoroughly.
6. **Backward compatibility:** Existing code expects global roles; migration path needed.

**Questions to answer before designing:**
- Should a coach in School A be able to create a sub-role in School B? (probably not)
- Can a sub-role be deleted if it has members? What happens to those members?
- Is there a sub-role "admin" that can manage other sub-roles within the school?
- UI: Where does school sub-role management live? (new section in SchoolTab?)

**Feasibility:** Medium — doable but touches auth layer, migrations, and RLS. Estimate: 1–2 weeks design + implementation.

---
import { expect, it } from 'vitest';
import { can, ROLE_KEYS } from './permissions';

it('lets only school admins, principals and teachers read students', () => {
  const allowed = ROLE_KEYS.filter((role) => can(role, 'sis.student.read'));
  expect(allowed).toEqual(['school_admin', 'principal', 'teacher']);
});

import { session } from '@/app/login/session.ts';

export function helper(): string {
  return session();
}

import type { UnionShape } from './no-handmade-json-types.ts';

export type UnionMemberKind =
  | { type: 'primitive' }
  | { type: 'array' }
  | { type: 'index' }
  | { type: 'partner'; name: string; container: 'array' | 'index' };

export function classifyHandmadeUnion(members: Iterable<UnionMemberKind>): UnionShape {
  let primitiveCount = 0;
  let hasArray = false;
  let hasIndex = false;
  const partners = new Set<string>();
  for (const member of members) {
    switch (member.type) {
      case 'primitive':
        primitiveCount += 1;
        break;
      case 'array':
        hasArray = true;
        break;
      case 'index':
        hasIndex = true;
        break;
      case 'partner':
        partners.add(member.name);
        if (member.container === 'array') {
          hasArray = true;
        } else {
          hasIndex = true;
        }
        break;
    }
  }
  return {
    handmade: primitiveCount >= 2 && hasArray && hasIndex,
    partners,
  };
}

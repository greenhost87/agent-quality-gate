export const SECTIONS = ['dependencies', 'devDependencies'] as const;

export function allowed(section: string): boolean {
  return (SECTIONS as readonly string[]).includes(section);
}

export const PRESET_DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies'] as const;

export type PresetDependencySection = (typeof PRESET_DEPENDENCY_SECTIONS)[number];

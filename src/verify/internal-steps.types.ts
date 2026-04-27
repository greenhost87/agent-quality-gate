export interface HeadingLocation {
  text: string;
  normalizedText: string;
  line: number;
  column: number;
}

export interface DuplicateHeading {
  filePath: string;
  heading: HeadingLocation;
  firstHeading: HeadingLocation;
}

export interface FenceState {
  marker: string;
  length: number;
}

export interface EslintConfigModule<TConfig> {
  default: TConfig[];
}

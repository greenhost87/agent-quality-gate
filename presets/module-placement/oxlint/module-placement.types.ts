export type ParsedOptions = {
  directories: string[];
  rootExceptions: Map<string, Set<string>>;
};

export type WatchedMatch = {
  directory: string;
  watchedRelative: string;
};

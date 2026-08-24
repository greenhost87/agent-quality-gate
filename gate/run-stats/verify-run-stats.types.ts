export type VerifyRunStatsResult = 0 | 1 | -1;

/**
 * One JSONL line in `$AGENT_QUALITY_GATE_HOME/stats/verify-runs.jsonl`.
 * Flat compact keys: `{"t":1777,"r":0,"ms":942,"path":"/...","c":80,"pl":850,"o":820,"sh":170,"cx":90,"pr":12}`.
 */
export type VerifyRunStatsRecord = {
  /** unix seconds */
  t: number;
  /** 0 ok, 1 fail, -1 skipped/unconfigured */
  r: VerifyRunStatsResult;
  /** total wall ms */
  ms: number;
  path: string;
  /** fallow cycle preflight */
  c?: number;
  /** parallel wall */
  pl?: number;
  /** oxlint */
  o?: number;
  /** fallow `--skip health` */
  sh?: number;
  /** fallow `health --complexity` */
  cx?: number;
  /** presets */
  pr?: number;
};

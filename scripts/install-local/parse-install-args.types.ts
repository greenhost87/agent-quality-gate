export type InstallArgs = {
  prefix: string;
  version: string | undefined;
  localBuild: boolean;
  wireOnly: boolean;
  piFlag: boolean;
  cursorFlag: boolean;
  claudeFlag: boolean;
  codexFlag: boolean;
};

export type ParseInstallArgsResult = InstallArgs | 'help';

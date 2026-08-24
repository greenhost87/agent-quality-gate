export type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GithubRelease = {
  tag_name: string;
  assets: readonly GithubReleaseAsset[];
};

import remarkLint from 'remark-lint';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';
import remarkLintMaximumLineLength from 'remark-lint-maximum-line-length';
import remarkLintNoDuplicateHeadings from 'remark-lint-no-duplicate-headings';

const config = {
  plugins: [remarkLint, remarkPresetLintRecommended, [remarkLintMaximumLineLength, 140], remarkLintNoDuplicateHeadings],
};

export default config;

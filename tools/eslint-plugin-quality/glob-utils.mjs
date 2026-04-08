const cache = new Map();

export function normalizePath(value = '') {
  return value.replace(/\\/g, '/');
}

function escapeRegexChar(char) {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

export function globToRegExp(glob) {
  const normalizedGlob = normalizePath(glob);

  if (cache.has(normalizedGlob)) {
    return cache.get(normalizedGlob);
  }

  let source = '';

  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const current = normalizedGlob[index];
    const next = normalizedGlob[index + 1];

    if (current === '*') {
      if (next === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (current === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegexChar(current);
  }

  const regex = new RegExp(`^${source}$`);
  cache.set(normalizedGlob, regex);
  return regex;
}

export function matchesAny(filepath, patterns = []) {
  const normalizedPath = normalizePath(filepath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalizedPath));
}

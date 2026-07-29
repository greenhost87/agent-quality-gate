const typeFileNamePattern = /\.d\.(?:c|m)?ts$|(?:\.types|\.contracts|\.interfaces)\.tsx?$|\/types\.tsx?$/u;

export function isTypeOnlyFile(filename) {
  return filename !== '<input>' && filename !== '<text>' && typeFileNamePattern.test(filename.replaceAll('\\', '/'));
}

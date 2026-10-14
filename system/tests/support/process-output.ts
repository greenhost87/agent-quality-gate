export async function processOutput(
  child: Bun.Subprocess,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(typeof child.stderr === 'number' ? null : child.stderr).text(),
    new Response(typeof child.stdout === 'number' ? null : child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

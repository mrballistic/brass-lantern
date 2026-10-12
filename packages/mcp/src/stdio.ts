/**
 * Stdout carries the MCP protocol, so a world's console.log (at load or while a script runs)
 * would corrupt it. Routes the console's stdout methods to stderr; the SDK transport writes
 * through process.stdout.write directly, so it is unaffected. Returns a function that undoes it.
 */
export function quietStdout(): () => void {
  const methods = ['log', 'info', 'debug', 'warn'] as const;
  const saved = methods.map((m) => console[m]);
  for (const m of methods) console[m] = (...args: unknown[]) => console.error(...args);
  return () => methods.forEach((m, i) => void (console[m] = saved[i] as never));
}

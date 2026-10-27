// Заглушка для функций, которые ещё не реализованы владельцем зоны.
export function notImplemented(owner: string, fn: string): never {
  throw new Error(`Не реализовано: ${fn} (${owner})`);
}

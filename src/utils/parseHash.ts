const hashRegex = /#\/(content\/(?:\w+\/)*\w+)/g;

export function parseHash(hash: string): string[] | null {
  let match = hash.match(hashRegex);

  if (!match) return null;

  return match[0].split("/");
}

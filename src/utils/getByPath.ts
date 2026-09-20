export default function getByPath(source: any, path?: string): any {
  if (!source || !path) {
    return undefined;
  }
  return path
    .split(".")
    .reduce(
      (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
      source
    );
}

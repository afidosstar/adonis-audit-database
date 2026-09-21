/** Remplace la valeur des colonnes sensibles par "[masqué]" (secrets, jetons, hachages). */
export default function redactRow(
  row: Record<string, any> | undefined,
  redact?: string[]
): Record<string, any> | undefined {
  if (!row || !redact || redact.length === 0) {
    return row;
  }
  return Object.keys(row).reduce((acc, key) => {
    acc[key] = redact.includes(key) ? "[masqué]" : row[key];
    return acc;
  }, {} as Record<string, any>);
}

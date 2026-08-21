/** Escape a user-provided string for use inside PocketBase double-quoted filter literals. */
export function escapePocketBaseFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function joinFilters(parts: Array<string | undefined | null | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' && ');
}

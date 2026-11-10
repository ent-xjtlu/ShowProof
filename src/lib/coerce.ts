export type Dict = Record<string, unknown>

export const dict = (value: unknown): Dict =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Dict)
    : {}

export const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback

export const bool = (value: unknown): boolean => value === true

export const strings = (value: unknown): string[] =>
  array(value).map((item) => str(item)).filter(Boolean)

export interface EdgeData extends Record<string, unknown> {
  dependencyName?: string;
  label?: string | null;
  enabled?: boolean;
}
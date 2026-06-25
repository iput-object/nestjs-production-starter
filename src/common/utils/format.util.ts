/**
 * Fills `{name}` placeholders in a localized template with the given values.
 * Keeps interpolation out of the locale files while still letting message text
 * live there. Unmatched placeholders are left untouched.
 */
export function format(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

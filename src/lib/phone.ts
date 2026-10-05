// Accepts Bulgarian mobile/landline numbers only: "+359XXXXXXXXX" or local "0XXXXXXXXX".
// Returns the E.164 form ("+359...") or null when the input is not acceptable.
export function normalizeBgPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+359\d+$/.test(cleaned)) national = cleaned.slice(4);
  else if (/^0\d+$/.test(cleaned)) national = cleaned.slice(1);
  else return null;

  // National significant number: 8 or 9 digits, never starting with 0.
  if (!/^[1-9]\d{7,8}$/.test(national)) return null;
  return `+359${national}`;
}

// Any acceptable contact number, returned as E.164 ("+...").
// - Bulgarian input ("0XXXXXXXXX" or "+359...") keeps the strict Bulgarian rules.
// - Any other number must be international E.164: "+" and 8-15 digits, first digit not 0.
//   Spaces, dashes, dots and parentheses are stripped. No per-country length table.
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("0") || cleaned.startsWith("+359")) return normalizeBgPhone(cleaned);
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) return null;
  return cleaned;
}

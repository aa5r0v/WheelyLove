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

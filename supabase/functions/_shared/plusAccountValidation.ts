export function isValidPlusEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPlusPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 72;
}

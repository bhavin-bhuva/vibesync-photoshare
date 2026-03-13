const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444",
  "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "1212", "0101",
]);

export function generateSecurePin(): string {
  let pin: string;
  do {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    pin = String(bytes[0] % 10000).padStart(4, "0");
  } while (WEAK_PINS.has(pin));
  return pin;
}

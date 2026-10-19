// Cosmetic randomness only (noise, sparkle, where a coin lands). Outcomes come from the server.
const buf = new Uint32Array(1);
export function jitter(): number {
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export function toExactArrayBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}

import assert from "node:assert/strict";
import test from "node:test";
import { toExactArrayBuffer } from "../../src/lib/binary-upload";

test("copies every binary byte into an exact ArrayBuffer for cloud uploads", () => {
  const source = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x91, 0xff, 0x13, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const uploadBody = toExactArrayBuffer(source);

  assert.equal(uploadBody.byteLength, source.byteLength);
  assert.deepEqual(Buffer.from(uploadBody), source);
});

test("copies only the visible bytes from a sliced buffer", () => {
  const source = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]).subarray(1, 3);
  const uploadBody = toExactArrayBuffer(source);

  assert.deepEqual(Buffer.from(uploadBody), Buffer.from([0xbb, 0xcc]));
});

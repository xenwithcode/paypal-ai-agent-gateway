// lib/voice/wav.ts
//
// How the recording is packaged when something other than Live has to hear it.
//
// The browser sends PCM16 mono at 16 kHz — the rate Live takes natively — and
// that is exactly what the second-opinion transcriber calls for when Live
// does not answer. But a text model asked for raw `audio/pcm` rejects it:
// measured on 1-nov, `gemini-2.5-flash` answered *400 invalid argument* to
// the identical bytes that a WAV header makes acceptable in 1.7 seconds.
//
// So the header is written here, once, instead of the caller asking for a
// different microphone: forty-four bytes of RIFF in front of the samples,
// and the same audio every model can hear.
//
// Pure on purpose — it is byte surgery, it has no opinion about the SDK, and
// a header written wrong is an error the API reports as an invalid argument
// with no hint of which argument, which is why a test owns it byte for byte.
//

/** Bytes of canonical RIFF/WAVE header in front of the samples. */
export const WAV_HEADER_BYTES = 44;

/**
 * Wrap PCM16 mono samples in a minimal, standards-shaped WAV header.
 *
 * `samples` may arrive base64 (the shape the voice route receives) or as a
 * Buffer; either way what comes back is base64, ready for `inlineData`.
 * A wrong sample rate would make every transcription read like a chipmunk
 * on a tape recorder, so the rate is an explicit argument rather than a
 * default the caller can forget to match to the audio it is sending.
 */
export function wavFromPcm16k(samples: string | Buffer, rate: number = 16_000): string {
  const pcm = typeof samples === "string" ? Buffer.from(samples, "base64") : samples;

  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4); // RIFF chunk: everything after this field
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate: mono, 16 bits
  header.writeUInt16LE(2, 32); // block align: one 16-bit mono frame
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString("base64");
}

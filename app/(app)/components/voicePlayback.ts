// app/(app)/components/voicePlayback.ts
//
// One decoder for the agent's voice, wherever it is played from.
//
// The reply from `/api/agent/voice` is base64 PCM16 mono at 24 kHz — the rate
// Gemini Live speaks. This used to live inside `VoiceCommand`, which was
// correct while the microphone was the only thing that talked back. The
// typed draft now speaks too (the agent confirms what it did after any
// draft, spoken or written), and two copies of this decoder is two places
// where a sample-rate fix would land in one and not the other — which on
// audio means one surface sounds slowed-down and neither says why.

/** PCM16 mono at 24 kHz — what the model speaks back. */
export const REPLY_RATE = 24_000;

/**
 * Play one reply, and hand back its source so a click can end it.
 *
 * The buffer carries its own sample rate, so the context can stay at whatever
 * the hardware wants and the browser resamples on the way out — which means
 * this works on a laptop and on a phone without either being asked to change.
 *
 * The context must have been created inside a user gesture (a click): autoplay
 * policy lets a context that began inside a gesture keep talking, and one
 * created after three round trips is a context that starts muted with no
 * error anyone can see. The callers own that — this function only plays.
 */
export function playPcmReply(
  context: AudioContext,
  base64: string,
  register: (source: AudioBufferSourceNode) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      const floats = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        floats[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff);
      }
      if (floats.length === 0) {
        resolve();
        return;
      }

      const buffer = context.createBuffer(1, floats.length, REPLY_RATE);
      buffer.getChannelData(0).set(floats);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      // Handed back before it starts, so a click during playback can end it.
      register(source);
      source.onended = () => resolve();
      source.start();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// public/voice-capture-worklet.js
//
// The microphone, on the audio thread.
//
// This is what replaces ScriptProcessorNode, which the browser has been
// deprecating for years and now names out loud in the console on every
// recording: *"The ScriptProcessorNode is deprecated. Use AudioWorkletNode
// instead."* Two warnings per test run on a product whose notes promise
// a console with zero issues, for a node that has been superseded since 2017.
//
// The rules it must keep are the ones the old node was there for:
//
//  · Copy the block. The buffer handed to `process` belongs to the audio
//    thread and is reused on the next block — holding it would record the
//    last four thousand samples forever. The copy is transferred by buffer
//    below, so the main thread pays for one allocation and no second copy.
//  · Write nothing. The node is connected to the destination because a
//    worklet with no output does not get scheduled; it produces silence,
//    so the microphone never comes back through the speakers as feedback.
//  · Keep the shape the caller already expects: Float32 samples at the
//    context's rate, one block per message, and only while it is connected.
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    const copy = channel.slice();
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor("voice-capture", VoiceCaptureProcessor);

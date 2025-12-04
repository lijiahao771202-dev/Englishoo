
import { pipeline, env } from '@xenova/transformers';

// Skip local model check - use remote models from Hugging Face
env.allowLocalModels = false;

// Disable ONNX Runtime warning logging if possible (May not work in all versions)
// These warnings are usually harmless cleanup messages
if (env.backends?.onnx) {
    env.backends.onnx.wasm.proxy = false; // Ensure we run in worker
}

// Singleton instance
class WhisperPipeline {
  static task = 'automatic-speech-recognition';
  static model = 'Xenova/whisper-tiny';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

// Message Handler
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'load') {
    try {
      await WhisperPipeline.getInstance((data) => {
        // Relay progress back to main thread
        self.postMessage({
          type: 'download',
          data: data
        });
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', data: err.message });
    }
  } else if (type === 'transcribe') {
    try {
      const transcriber = await WhisperPipeline.getInstance();
      
      // data.audio should be Float32Array of 16k sample rate
      const output = await transcriber(data.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
        return_timestamps: true,
      });

      self.postMessage({
        type: 'result',
        data: output
      });
    } catch (err) {
      self.postMessage({ type: 'error', data: err.message });
    }
  }
});

class WakeFrames extends AudioWorkletProcessor {
  constructor(options){super();this.frame=new Int16Array(options.processorOptions.frameLength);this.i=0;}
  process(inputs){const samples=inputs[0]?.[0];if(samples)for(const s of samples){this.frame[this.i++]=Math.max(-32768,Math.min(32767,Math.round(s*32767)));if(this.i===this.frame.length){this.port.postMessage(this.frame);this.i=0;}}return true;}
}
registerProcessor('wake-frames',WakeFrames);

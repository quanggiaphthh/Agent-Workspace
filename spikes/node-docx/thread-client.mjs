import { Worker } from 'node:worker_threads';

let active=false;
const DEFAULT_DEADLINE_MS=30_000;
export function processInWorker(operation,bytes,input={},options={}) {
  if(active){const e=new Error('Processor busy.');e.code='PROCESSOR_BUSY';return Promise.reject(e);}
  const {signal,deadlineMs=DEFAULT_DEADLINE_MS}=options;
  if(signal?.aborted){const e=new Error('Processing cancelled.');e.code='PROCESSING_CANCELLED';return Promise.reject(e);}
  if(!Buffer.isBuffer(bytes)||bytes.length>20*1024*1024){const e=new Error('Input too large.');e.code='INPUT_TOO_LARGE';return Promise.reject(e);}
  active=true;
  const worker=new Worker(new URL('./processor-worker.mjs',import.meta.url),{resourceLimits:{maxOldGenerationSizeMb:192,stackSizeMb:8}});
  let settled=false,timer,onAbort;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);active=false;void worker.terminate();fn(value);};
  const coded=code=>{const e=new Error('DOCX processing failed safely.');e.code=code;return e;};
  return new Promise((resolve,reject)=>{
    onAbort=()=>finish(reject,coded('PROCESSING_CANCELLED'));
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>finish(reject,coded('PROCESSING_TIMEOUT')),deadlineMs);
    worker.once('message',message=>message.ok?finish(resolve,message.result):finish(reject,coded(message.code)));
    worker.once('error',()=>finish(reject,coded('PROCESSING_FAILED')));
    worker.once('exit',code=>{if(!settled&&code!==0)finish(reject,coded('PROCESSING_FAILED'));});
    worker.postMessage({operation,bytes,input});
  });
}

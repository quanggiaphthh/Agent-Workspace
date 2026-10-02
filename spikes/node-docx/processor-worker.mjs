import { parentPort } from 'node:worker_threads';
import { inspect, applyAlignment } from './processor.mjs';

parentPort.on('message', async ({operation, bytes, input, signal}) => {
  try {
    const payload=Buffer.from(bytes);
    const result=operation==='inspect'
      ? await inspect(payload)
      : await applyAlignment(payload,input);
    parentPort.postMessage({ok:true,result});
  } catch (error) {
    parentPort.postMessage({ok:false,code:typeof error?.code==='string'?error.code:'PROCESSING_FAILED'});
  }
});

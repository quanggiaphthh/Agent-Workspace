import { parentPort } from 'node:worker_threads';
import { inspect, applyAlignment, applyTopMargin, applyAdministrativePageLayout } from './docxPackage.mjs';

parentPort.on('message', async ({operation, bytes, input, signal}) => {
  try {
    const payload=Buffer.from(bytes);
    const result=operation==='inspect'
      ? await inspect(payload)
      : operation==='applyAlignment' ? await applyAlignment(payload,input)
      : operation==='applyTopMargin' ? await applyTopMargin(payload,input)
      : operation==='applyAdministrativePageLayout' ? await applyAdministrativePageLayout(payload)
      : (() => { const error = new Error('Unsupported operation'); error.code = 'UNSUPPORTED_OPERATION'; throw error; })();
    parentPort.postMessage({ok:true,result});
  } catch (error) {
    parentPort.postMessage({ok:false,code:typeof error?.code==='string'?error.code:'PROCESSING_FAILED'});
  }
});

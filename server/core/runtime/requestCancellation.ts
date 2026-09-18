interface EventSourceLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
  removeListener?(event: string, listener: (...args: any[]) => void): unknown;
  aborted?: boolean;
  writableEnded?: boolean;
}

export class ExecutionCancelledError extends Error {
  public readonly code = 'EXECUTION_CANCELLED';

  constructor(message = 'Execution cancelled because the client disconnected or aborted the request.') {
    super(message);
    this.name = 'ExecutionCancelledError';
  }
}

export function isCancellationError(error: unknown): boolean {
  return error instanceof ExecutionCancelledError
    || (typeof error === 'object' && error !== null && (error as any).code === 'EXECUTION_CANCELLED')
    || (typeof error === 'object' && error !== null && (error as any).name === 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ExecutionCancelledError();
  }
}

function detach(source: EventSourceLike, event: string, listener: (...args: any[]) => void) {
  if (typeof source.off === 'function') source.off(event, listener);
  else if (typeof source.removeListener === 'function') source.removeListener(event, listener);
}

export function bindRequestCancellation(req: EventSourceLike, res: EventSourceLike) {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const onRequestAborted = () => abort();
  const onRequestClose = () => {
    if (req.aborted === true && res.writableEnded !== true) abort();
  };
  const cleanup = () => {
    detach(req, 'aborted', onRequestAborted);
    detach(req, 'close', onRequestClose);
    detach(res, 'close', onResponseClose);
    detach(res, 'finish', onResponseFinish);
  };
  const onResponseClose = () => {
    if (res.writableEnded !== true) abort();
    cleanup();
  };
  const onResponseFinish = () => cleanup();

  req.on('aborted', onRequestAborted);
  req.on('close', onRequestClose);
  res.on('close', onResponseClose);
  res.on('finish', onResponseFinish);

  if (req.aborted === true) abort();

  return {
    signal: controller.signal,
    cleanup,
  };
}

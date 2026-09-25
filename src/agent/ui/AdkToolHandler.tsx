import { useEffect, useRef } from 'react';
import { useAgentRuntime } from './AdkRuntimeProvider';
import { clientCapabilityRegistry, projectServerUiAction } from '../../core/capabilities/capabilityRegistry';

function toolResponseIds(messages: any[]): string[] {
  return messages.flatMap((message: any) => {
    if (!Array.isArray(message?.content)) return [];
    return message.content.flatMap((part: any) =>
      part?.type === 'tool-response' && typeof part.toolCallId === 'string' && part.toolCallId
        ? [part.toolCallId]
        : [],
    );
  });
}

/**
 * Projects successful server-validated UI actions through the existing local
 * capability registry. Durable history is display-only: at the start of every
 * live Agent run all already-present tool responses are marked as seen, so a
 * restored conversation can never replay navigation/refresh/notification side
 * effects. New tool responses are applied at most once by toolCallId.
 */
export function AdkToolHandler() {
  const { threadState, activeSessionId } = useAgentRuntime();
  const { messages, isRunning } = threadState;
  const processedToolCalls = useRef<Set<string>>(new Set());
  const wasRunning = useRef(false);
  const sessionIdRef = useRef(activeSessionId);

  useEffect(() => {
    if (sessionIdRef.current === activeSessionId) return;
    sessionIdRef.current = activeSessionId;
    processedToolCalls.current.clear();
    wasRunning.current = false;
  }, [activeSessionId]);

  useEffect(() => {
    if (!messages) return;

    // A run is started before its network response arrives. Snapshot everything
    // already on screen at that boundary so hydrated/prior responses are never
    // interpreted as fresh UI commands.
    if (isRunning && !wasRunning.current) {
      toolResponseIds(messages).forEach((id) => processedToolCalls.current.add(id));
      wasRunning.current = true;
      return;
    }

    // No live run has been observed in this session: history remains inert.
    if (!wasRunning.current) return;

    messages.forEach((message: any) => {
      if (message?.role !== 'assistant' || !Array.isArray(message.content)) return;
      message.content.forEach((part: any) => {
        if (part?.type !== 'tool-response' || typeof part.toolCallId !== 'string' || !part.toolCallId) return;
        if (processedToolCalls.current.has(part.toolCallId)) return;

        const projection = projectServerUiAction(part.result);
        if (!projection) return;

        // Claim before execution: streaming accumulators can surface the same
        // completed tool response repeatedly while later tokens arrive.
        processedToolCalls.current.add(part.toolCallId);
        void clientCapabilityRegistry.execute(projection.capabilityId, projection.input)
          .then((result) => {
            if (!result.success) console.warn('Agent UI action was rejected by the client capability registry.');
          })
          .catch(() => {
            console.warn('Agent UI action could not be applied.');
          });
      });
    });

    // Keep the run armed through the final render so a terminal tool response
    // cannot be lost if React batches it with isRunning=false.
    if (!isRunning) wasRunning.current = false;
  }, [messages, isRunning]);

  return null;
}

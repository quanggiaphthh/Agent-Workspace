import { useEffect, useRef } from "react";
import { useAgentRuntime } from "./AdkRuntimeProvider";
import { navigationService } from "../../core/navigation/navigationService";
import { eventBus } from "../../core/events/eventBus";

/**
 * AdkToolHandler
 *
 * Watches successful canonical tool responses for uiAction payloads and
 * triggers the corresponding client-side side effects. Capability gateway
 * responses wrap business output under result, so unwrap that envelope before
 * interpreting UI actions and never execute failed tool responses.
 */
export function AdkToolHandler() {
  const { threadState } = useAgentRuntime();
  const messages = threadState.messages;
  const processedToolCalls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!messages) return;

    messages.forEach((msg: any) => {
      if (msg.role === 'assistant' && msg.content && Array.isArray(msg.content)) {
        msg.content.forEach((part: any) => {
          if (part.type !== 'tool-response' || !part.toolCallId) return;

          const envelope = part.result;
          if (!envelope || envelope.success === false) return;
          const result = envelope.success === true && envelope.result && typeof envelope.result === 'object'
            ? envelope.result
            : envelope;

          if (!result?.uiAction || processedToolCalls.current.has(part.toolCallId)) return;
          processedToolCalls.current.add(part.toolCallId);

          switch (result.uiAction) {
            case 'openModule':
              navigationService.openModule(result.moduleId);
              break;
            case 'openEntity':
              navigationService.openEntity(result.entity.moduleId, result.entity.entityType, result.entity.entityId);
              break;
            case 'refresh':
              eventBus.emit('canvas.refreshRequested', { target: result.target });
              break;
            case 'showNotification':
              eventBus.emit('notification.show', result.notification);
              break;
          }
        });
      }
    });
  }, [messages]);

  return null;
}

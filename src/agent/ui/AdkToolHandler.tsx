import { useEffect, useRef } from "react";
import { useAgentRuntime } from "./AdkRuntimeProvider";
import { navigationService } from "../../core/navigation/navigationService";
import { eventBus } from "../../core/events/eventBus";

/**
 * AdkToolHandler
 * 
 * Watches the assistant runtime for tool results that contain 'uiAction' 
 * and triggers the corresponding client-side side effects.
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
          if (part.type === 'tool-response' && part.toolCallId) {
            const result = part.result;
            
            if (result && result.uiAction && !processedToolCalls.current.has(part.toolCallId)) {
              processedToolCalls.current.add(part.toolCallId);
              
              const { uiAction } = result;
              console.log(`[AdkToolHandler] Triggering UI Action: ${uiAction}`, result);

              switch (uiAction) {
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
            }
          }
        });
      }
    });
  }, [messages]);

  return null;
}

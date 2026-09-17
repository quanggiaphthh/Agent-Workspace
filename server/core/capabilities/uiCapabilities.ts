import { z } from 'zod';
import { ServerCapabilityRegistry } from './serverCapabilityRegistry';

export function registerUiCapabilities() {
  ServerCapabilityRegistry.register({
    id: 'ui.openEntity',
    moduleId: 'ui',
    description: 'Instruct the Canvas to open and highlight an entity (e.g. moduleId: "demo", entityType: "item", entityId: "item-101").',
    inputSchema: z.object({
      moduleId: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      label: z.string().optional(),
    }),
    risk: 'low',
    permissions: [],
    execute: async (input) => {
      return { uiAction: 'openEntity', entity: input };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'ui.openModule',
    moduleId: 'ui',
    description: 'Navigate the App Shell to a specific module (e.g. "home", "demo", "settings").',
    inputSchema: z.object({
      moduleId: z.string(), // Use string to be module-agnostic
    }),
    risk: 'low',
    permissions: [],
    execute: async (input) => {
      return { uiAction: 'openModule', moduleId: input.moduleId };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'ui.refresh',
    moduleId: 'ui',
    description: 'Request the active view on Canvas to refresh its data.',
    inputSchema: z.object({
      target: z.string().optional(),
    }),
    risk: 'low',
    permissions: [],
    execute: async (input) => {
      return { uiAction: 'refresh', target: input.target || 'current' };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'ui.showNotification',
    moduleId: 'ui',
    description: 'Display a toast notification message to the user.',
    inputSchema: z.object({
      message: z.string(),
      type: z.enum(['info', 'success', 'warning', 'error']).default('info'),
    }),
    risk: 'low',
    permissions: [],
    execute: async (input) => {
      return { uiAction: 'showNotification', notification: input };
    },
  });
}

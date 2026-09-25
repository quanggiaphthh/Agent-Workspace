import React from 'react';
import { CapabilityDescriptor } from './capability';

export interface NavigationContribution {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order?: number;
  badge?: string | number;
}

export interface RouteContribution {
  path: string;
  component: React.ComponentType<any>;
  exact?: boolean;
}

export interface DashboardWidgetContribution {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<any>;
  order?: number;
  width?: 'full' | 'half' | 'third';
}

export interface AgentSuggestionContribution {
  id: string;
  label: string;
  prompt: string;
  requiredCapabilities?: string[];
}

export interface AgentUiContribution {
  suggestions?: AgentSuggestionContribution[];
}

export interface EventDescriptor {
  type: string;
  description: string;
}

export interface ModuleManifest {
  id: string;
  version: string;
  meta: {
    name: string;
    description?: string;
    icon?: string;
    order?: number;
  };
  navigation?: NavigationContribution[];
  routes: RouteContribution[];
  capabilities?: CapabilityDescriptor<any, any>[];
  widgets?: DashboardWidgetContribution[];
  agent?: AgentUiContribution;
  events?: EventDescriptor[];
  permissions?: string[];
  lifecycle?: {
    onEnable?: () => Promise<void>;
    onDisable?: () => Promise<void>;
  };
}

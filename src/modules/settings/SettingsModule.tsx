import React, { useState } from 'react';
import { ModuleManagerTab } from './ModuleManagerTab';
import { AgentAIManagerTab } from './AgentAIManagerTab';
import { BrainCircuit, Boxes } from 'lucide-react';
import { useContextStore } from '../../core/context/contextStore';

type SettingsTab = 'ai-agents' | 'modules';

export const PRIMARY_SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'ai-agents', label: 'Trợ lý AI' },
  { id: 'modules', label: 'Module' },
];

export function SettingsModule() {
  const user = useContextStore(state => state.user);
  const canManageModules = user.roles.includes('admin') || user.permissions.includes('module.manage');
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-agents');
  const visibleTab = activeTab === 'modules' && !canManageModules ? 'ai-agents' : activeTab;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="border-b border-neutral-200 pb-3">
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Cài đặt</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Điều chỉnh Trợ lý AI và các chức năng có sẵn trong ứng dụng.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-4" role="tablist" aria-label="Cài đặt">
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === 'ai-agents'}
            onClick={() => setActiveTab('ai-agents')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              visibleTab === 'ai-agents' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <BrainCircuit className="h-4 w-4" aria-hidden="true" />
            Trợ lý AI
          </button>
          {canManageModules && (
            <button
              type="button"
              role="tab"
              aria-selected={visibleTab === 'modules'}
              onClick={() => setActiveTab('modules')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                visibleTab === 'modules' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Boxes className="h-4 w-4" aria-hidden="true" />
              Module
            </button>
          )}
        </div>
      </div>

      {visibleTab === 'ai-agents' && <AgentAIManagerTab />}
      {visibleTab === 'modules' && canManageModules && <ModuleManagerTab />}
    </div>
  );
}

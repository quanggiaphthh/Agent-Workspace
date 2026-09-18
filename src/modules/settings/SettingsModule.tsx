import React, { useMemo, useState } from 'react';
import { ModuleManagerTab } from './ModuleManagerTab';
import { AuditLogTab } from './AuditLogTab';
import { AgentAIManagerTab } from './AgentAIManagerTab';
import { Sliders, ShieldCheck, BrainCircuit } from 'lucide-react';
import { useContextStore } from '../../core/context/contextStore';

type SettingsTab = 'modules' | 'audit' | 'ai-agents';

export function SettingsModule() {
  const user = useContextStore(state => state.user);
  const canManageModules = user.roles.includes('admin') || user.permissions.includes('module.manage');
  const canViewAudit = user.roles.includes('admin') || user.permissions.includes('audit.read');

  const allowedTabs = useMemo<SettingsTab[]>(() => {
    const tabs: SettingsTab[] = ['ai-agents'];
    if (canManageModules) tabs.unshift('modules');
    if (canViewAudit) tabs.push('audit');
    return tabs;
  }, [canManageModules, canViewAudit]);

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-agents');
  const visibleTab = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="border-b border-neutral-200 pb-3">
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Cài đặt Hệ thống & Trợ lý</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Cấu hình Agent AI; các chức năng quản trị chỉ hiển thị khi tài khoản có quyền tương ứng.
        </p>

        <div className="flex items-center gap-2 mt-4">
          {canManageModules && (
            <button
              onClick={() => setActiveTab('modules')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                visibleTab === 'modules' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Quản lý Phân hệ
            </button>
          )}
          <button
            onClick={() => setActiveTab('ai-agents')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              visibleTab === 'ai-agents' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Quản lý Agent AI
          </button>
          {canViewAudit && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                visibleTab === 'audit' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Nhật ký Hệ thống
            </button>
          )}
        </div>
      </div>

      {visibleTab === 'modules' && canManageModules && <ModuleManagerTab />}
      {visibleTab === 'ai-agents' && <AgentAIManagerTab />}
      {visibleTab === 'audit' && canViewAudit && <AuditLogTab />}
    </div>
  );
}

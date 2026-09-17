import React, { useState } from 'react';
import { ModuleManagerTab } from './ModuleManagerTab';
import { AuditLogTab } from './AuditLogTab';
import { AgentAIManagerTab } from './AgentAIManagerTab';
import { Sliders, ShieldCheck, BrainCircuit } from 'lucide-react';

export function SettingsModule() {
  const [activeTab, setActiveTab] = useState<'modules' | 'audit' | 'ai-agents'>('modules');

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="border-b border-neutral-200 pb-3">
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Cài đặt Hệ thống & Quản trị</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Quản lý đăng ký phân hệ, nhật ký an toàn và cấu hình AI Agents.
        </p>

        {/* Tabs navigation */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setActiveTab('modules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'modules'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Quản lý Phân hệ
          </button>
          <button
            onClick={() => setActiveTab('ai-agents')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'ai-agents'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Quản lý Agent AI
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'audit'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Nhật ký Hệ thống
          </button>
        </div>
      </div>

      {activeTab === 'modules' && <ModuleManagerTab />}
      {activeTab === 'ai-agents' && <AgentAIManagerTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}

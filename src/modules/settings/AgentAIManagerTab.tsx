import React, { useState, useEffect, useMemo } from 'react';
import { useAIKeysStore, SUPPORTED_PROVIDERS, APIKeyEntry, isAgentCredentialUsable } from './aiKeysStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  Key, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  Plus, 
  Trash2,
  ArrowUp,
  ArrowDown,
  BrainCircuit,
  Settings2,
  AlertCircle,
  Save,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_MODEL_NAME, DEFAULT_AGENT_PROVIDER, isAgentModelId } from '../../../shared/contracts/ai';

export function AgentAIManagerTab() {
  const store = useAIKeysStore();
  const { user, loading: authLoading } = useFirebaseAuth();
  
  // Local state for "drafting" changes
  const [localKeys, setLocalKeys] = useState<APIKeyEntry[]>([]);
  const [localAutoRotate, setLocalAutoRotate] = useState(false);
  const [localGlobalDefaultModel, setLocalGlobalDefaultModel] = useState<string | null>(null);
  const [localAgentProvider] = useState(DEFAULT_AGENT_PROVIDER);
  const [localAgentModel, setLocalAgentModel] = useState<string>(DEFAULT_AGENT_MODEL);
  const [localMemoryEnabled, setLocalMemoryEnabled] = useState(true);
  const [localWebSearchEnabled, setLocalWebSearchEnabled] = useState(false);
  const [localProviderDefaultModels, setLocalProviderDefaultModels] = useState<Record<string, string>>({});
  
  const [newKeyInputs, setNewKeyInputs] = useState<Record<string, string>>({});
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [localCredentialId, setLocalCredentialId] = useState('system');
  
  // Sync from store on mount
  useEffect(() => {
    store.syncKeys();
  }, []);

  useEffect(() => {
    setLocalKeys(store.keys);
    setLocalAutoRotate(store.autoRotate);
    setLocalGlobalDefaultModel(store.globalDefaultModel);
    setLocalAgentModel(store.agentModel);
    setLocalMemoryEnabled(store.memoryEnabled);
    setLocalWebSearchEnabled(store.webSearchEnabled);
    setLocalCredentialId(store.credentialId);
    setLocalProviderDefaultModels(store.providerDefaultModels);
  }, [
    store.keys, 
    store.autoRotate, 
    store.globalDefaultModel, 
    store.agentProvider, 
    store.agentModel,
    store.memoryEnabled,
    store.webSearchEnabled,
    store.credentialId,
    store.providerDefaultModels
  ]);

  const agentCredentialOptions = useMemo(() =>
    store.keys.filter((key) => key.providerId === DEFAULT_AGENT_PROVIDER && key.status === 'active'),
  [store.keys]);
  const selectedAgentCredentialIsUsable = isAgentCredentialUsable(
    localCredentialId,
    store.systemCredentialAvailable,
    store.keys,
  );

  const agentModelOptions = useMemo(() => {
    const discovered = store.providerLoadedModels[DEFAULT_AGENT_PROVIDER] || [];
    if (discovered.some((model) => model.id === DEFAULT_AGENT_MODEL)) return discovered;
    return [{ id: DEFAULT_AGENT_MODEL, name: DEFAULT_AGENT_MODEL_NAME }, ...discovered];
  }, [store.providerLoadedModels]);

  const hasChanges = useMemo(() => {
    return (
      JSON.stringify(localKeys) !== JSON.stringify(store.keys) ||
      localAutoRotate !== store.autoRotate ||
      localGlobalDefaultModel !== store.globalDefaultModel ||
      store.agentProvider !== DEFAULT_AGENT_PROVIDER ||
      localAgentModel !== store.agentModel ||
      localCredentialId !== store.credentialId ||
      localMemoryEnabled !== store.memoryEnabled ||
      localWebSearchEnabled !== store.webSearchEnabled
    );
  }, [
    localKeys, store.keys,
    localAutoRotate, store.autoRotate,
    localGlobalDefaultModel, store.globalDefaultModel,
    store.agentProvider,
    localAgentModel, store.agentModel,
    localCredentialId, store.credentialId,
    localMemoryEnabled, store.memoryEnabled,
    localWebSearchEnabled, store.webSearchEnabled
  ]);

  const agentReady = Boolean(
    user &&
    !authLoading &&
    store.aiSettingsHydrated &&
    localAgentProvider === DEFAULT_AGENT_PROVIDER &&
    isAgentModelId(localAgentModel) &&
    selectedAgentCredentialIsUsable
  );

  const handleSave = () => {
    setIsSaving(true);
    // Batch update store
    useAIKeysStore.setState({
      autoRotate: localAutoRotate,
      globalDefaultModel: localGlobalDefaultModel,
      agentProvider: DEFAULT_AGENT_PROVIDER,
      agentModel: localAgentModel || DEFAULT_AGENT_MODEL,
      credentialId: localCredentialId,
      memoryEnabled: localMemoryEnabled,
      webSearchEnabled: localWebSearchEnabled,
      providerDefaultModels: localProviderDefaultModels
    });
    
    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  const handleReset = () => {
    setLocalKeys(store.keys);
    setLocalAutoRotate(store.autoRotate);
    setLocalGlobalDefaultModel(store.globalDefaultModel);
    setLocalAgentModel(store.agentModel);
    setLocalMemoryEnabled(store.memoryEnabled);
    setLocalWebSearchEnabled(store.webSearchEnabled);
    setLocalCredentialId(store.credentialId);
    setLocalProviderDefaultModels(store.providerDefaultModels);
  };
  
  const [pendingKey, setPendingKey] = useState<{providerId: string, key: string, name: string} | null>(null);

  const testConnection = async (key: string, providerId: string) => {
    try {
      // Defensive check: Ensure key is not null/undefined and normalized
      const sanitizedKey = key?.trim() || '';
      const response = await authFetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, key: sanitizedKey })
      });

      const data = await response.json();
      // Even if not response.ok, we return data because it might have canSaveUnverified
      return { ...data, ok: response.ok };
    } catch (err: any) {
      // Catch network errors/fetch errors
      return { success: false, error: err.message || 'Lỗi kết nối mạng', ok: false };
    }
  };

  const [testStatuses, setTestStatuses] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error' | 'warning'>>({});

  const setStatus = (id: string, status: 'idle' | 'loading' | 'success' | 'error' | 'warning') => {
    setTestStatuses(prev => ({ ...prev, [id]: status }));
  };

  const refreshModels = async (providerId: string, credentialId: string) => {
    setStatus(`refresh_${credentialId}`, 'loading');
    try {
      const params = new URLSearchParams({ providerId, credentialId });
      const response = await authFetch(`/api/ai/models?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Lỗi ${response.status}: Không thể lấy danh sách models`);
      
      if (data.models) {
        store.setProviderLoadedModels(providerId, data.models);
        if (data.models.length > 0 && providerId === localAgentProvider) {
          const exists = data.models.some((m: any) => m.id === localAgentModel);
          if (!exists && localAgentModel !== DEFAULT_AGENT_MODEL) setLocalAgentModel(DEFAULT_AGENT_MODEL);
        }
      }
      setStatus(`refresh_${credentialId}`, 'success');
      setTimeout(() => setStatus(`refresh_${credentialId}`, 'idle'), 3000);
    } catch (err: any) {
      setStatus(`refresh_${credentialId}`, 'error');
      alert(`Lỗi: ${err.message}`);
    }
  };

  const handleAddAndTestKey = async (providerId: string) => {
    const val = newKeyInputs[providerId];
    if (!val?.trim()) return;
    
    setPendingKey(null);
    setStatus(`new_${providerId}`, 'loading');
    try {
      const data = await testConnection(val.trim(), providerId);
      
      if (data.ok && data.success) {
        await store.addKey(providerId, val.trim(), `${providerId.toUpperCase()} Key ${new Date().toLocaleDateString()}`);
        if (data.models) store.setProviderLoadedModels(providerId, data.models);
        setNewKeyInputs({ ...newKeyInputs, [providerId]: '' });
        setStatus(`new_${providerId}`, 'success');
        setTimeout(() => setStatus(`new_${providerId}`, 'idle'), 3000);
      } else if (data.canSaveUnverified) {
        setPendingKey({ providerId, key: val.trim(), name: `${providerId.toUpperCase()} Key ${new Date().toLocaleDateString()}` });
        setStatus(`new_${providerId}`, 'warning');
        alert(`Lưu ý: ${data.error || 'Nhà cung cấp đang gặp lỗi tạm thời.'}\n\nBạn có thể thử "Lưu chưa xác minh" để sử dụng sau.`);
      } else {
        throw new Error(data.error || `Xác thực thất bại (Status: ${data.statusCode || 'unknown'})`);
      }
    } catch (err: any) {
      setStatus(`new_${providerId}`, 'error');
      alert(`Lỗi: ${err.message}`);
    }
  };

  const saveUnverified = async () => {
    if (!pendingKey) return;
    const { providerId, key, name } = pendingKey;
    try {
      await store.addKey(providerId, key, name);
      setNewKeyInputs({ ...newKeyInputs, [providerId]: '' });
      setPendingKey(null);
      setStatus(`new_${providerId}`, 'success');
      setTimeout(() => setStatus(`new_${providerId}`, 'idle'), 3000);
    } catch (err: any) {
      alert(`Lỗi khi lưu: ${err.message}`);
    }
  };

  const removeLocalKey = async (id: string) => {
    await store.removeKey(id);
  };

  const testModel = async (providerId: string, credentialId: string, modelId: string) => {
    const testId = `test_model_${credentialId}_${modelId}`;
    setStatus(testId, 'loading');
    try {
      const response = await authFetch('/api/ai/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, credentialId, modelId })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Lỗi ${response.status}: Model test thất bại`);
      setStatus(testId, 'success');
      setTimeout(() => setStatus(testId, 'idle'), 3000);
    } catch (err: any) {
      setStatus(testId, 'error');
      alert(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Sticky Header with Save Button */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-neutral-50/80 backdrop-blur-md border-b border-neutral-200 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Quản lý API Keys</h2>
          {hasChanges && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
              Có thay đổi chưa lưu
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            className="text-neutral-500 hover:text-neutral-900"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" /> Hoàn tác
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-neutral-900 hover:bg-neutral-800 text-white shadow-lg shadow-neutral-200"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Lưu thiết lập
          </Button>
        </div>
      </div>

      {/* Thiết lập Agent Chatbox */}
      <Card className="overflow-hidden border border-neutral-200 shadow-sm bg-white">
        <div className="bg-indigo-50/50 border-b border-indigo-100/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-neutral-900">Thiết lập Trợ lý AI (Agent Chatbox)</h2>
          </div>
          <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest px-2 py-0.5 bg-indigo-100/50 rounded-full">
            Tối ưu cho Gemini
          </div>
        </div>
        
        <div className="p-5 space-y-6">
          <div className={`rounded-xl border px-4 py-3 ${agentReady ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className={`text-xs font-bold ${agentReady ? 'text-emerald-800' : 'text-amber-800'}`}>
              {agentReady ? 'Cấu hình Agent đã sẵn sàng' : 'Cấu hình Agent chưa sẵn sàng'}
            </div>
            <div className="text-[11px] text-neutral-600 mt-1">
              Google Gemini · {localAgentModel === DEFAULT_AGENT_MODEL ? DEFAULT_AGENT_MODEL_NAME : localAgentModel}
              {selectedAgentCredentialIsUsable
                ? ` · ${localCredentialId === 'system' ? 'System Gemini Key' : (agentCredentialOptions.find((key) => key.id === localCredentialId)?.name || 'Personal Gemini Key')}`
                : ' · Chưa có Gemini credential khả dụng'}
            </div>
            {!selectedAgentCredentialIsUsable && store.systemCredentialAvailable !== null && (
              <div className="text-[10px] text-amber-700 mt-1">
                Hãy cấu hình System Gemini Key hoặc thêm Personal Google/Gemini Key đang hoạt động.
              </div>
            )}
            {store.credentialSyncError && (
              <div className="text-[10px] text-red-700 mt-1">{store.credentialSyncError}</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cột 1: Cấu hình nguồn */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Nhà cung cấp</label>
                <select
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5 bg-neutral-100 text-neutral-700 font-medium cursor-not-allowed"
                  value={DEFAULT_AGENT_PROVIDER}
                  disabled
                  aria-label="Nhà cung cấp Agent Chatbox"
                >
                  <option value={DEFAULT_AGENT_PROVIDER}>Google (Gemini) — bắt buộc cho Agent Chatbox</option>
                </select>
                <p className="text-[10px] text-neutral-500">
                  Các provider khác vẫn dùng được trong API Key Manager, nhưng chưa được nối vào RootAgent.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">API Key (Credential)</label>
                  <div className="flex items-center gap-3">
                    <button 
                      className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                        testStatuses[`test_${localCredentialId}`] === 'success' ? 'text-emerald-600' :
                        testStatuses[`test_${localCredentialId}`] === 'error' ? 'text-red-600' :
                        'text-indigo-600 hover:text-indigo-700'
                      }`}
                      onClick={async () => {
                        const testId = `test_${localCredentialId}`;
                        setStatus(testId, 'loading');
                        try {
                           const response = await authFetch(`/api/ai/models?providerId=${localAgentProvider}&credentialId=${localCredentialId}`);
                           const data = await response.json();
                           if (data.success) setStatus(testId, 'success');
                           else throw new Error(data.error);
                           setTimeout(() => setStatus(testId, 'idle'), 3000);
                        } catch (e: any) { 
                          setStatus(testId, 'error');
                          alert(`Lỗi: ${e.message}`); 
                        }
                      }}
                      disabled={!selectedAgentCredentialIsUsable || testStatuses[`test_${localCredentialId}`] === 'loading'}
                    >
                      {testStatuses[`test_${localCredentialId}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                       testStatuses[`test_${localCredentialId}`] === 'success' ? <CheckCircle2 className="h-3 w-3" /> :
                       testStatuses[`test_${localCredentialId}`] === 'error' ? <AlertCircle className="h-3 w-3" /> :
                       <Key className="h-3 w-3" />}
                      {testStatuses[`test_${localCredentialId}`] === 'success' ? 'Hợp lệ' : 'Kiểm tra Key'}
                    </button>
                  </div>
                </div>
                <select 
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-neutral-50/30 font-medium"
                  value={selectedAgentCredentialIsUsable ? localCredentialId : '__none__'}
                  onChange={(e) => { if (e.target.value !== '__none__') setLocalCredentialId(e.target.value); }}
                >
                  {!selectedAgentCredentialIsUsable && (
                    <option value="__none__" disabled>
                      {store.credentialSyncError ? 'Không thể xác minh Gemini credential' : store.systemCredentialAvailable === null ? 'Đang kiểm tra Gemini credential…' : 'Chưa có Gemini credential khả dụng'}
                    </option>
                  )}
                  {store.systemCredentialAvailable === true && (
                    <option value="system">Sử dụng Key Hệ thống</option>
                  )}
                  {agentCredentialOptions.map(k => (
                    <option key={k.id} value={k.id}>{k.name} (Cá nhân)</option>
                  ))}
                </select>
                {store.systemCredentialAvailable === false && agentCredentialOptions.length === 0 && (
                  <p className="text-[10px] text-amber-700">
                    System Gemini Key chưa được cấu hình và chưa có Personal Google/Gemini Key đang hoạt động.
                  </p>
                )}
              </div>
            </div>

            {/* Cột 2: Cấu hình Model */}
            <div className="space-y-4 bg-neutral-50/50 p-4 rounded-xl border border-neutral-100">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Model ưu tiên</label>
                  <button 
                    className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                      testStatuses[`refresh_${localCredentialId}`] === 'success' ? 'text-emerald-600' :
                      'text-indigo-600 hover:text-indigo-700'
                    }`}
                    onClick={() => refreshModels(localAgentProvider, localCredentialId)}
                    disabled={!selectedAgentCredentialIsUsable || testStatuses[`refresh_${localCredentialId}`] === 'loading'}
                  >
                    {testStatuses[`refresh_${localCredentialId}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                     testStatuses[`refresh_${localCredentialId}`] === 'success' ? <CheckCircle2 className="h-3 w-3" /> :
                     <RefreshCw className="h-3 w-3" />}
                    Lấy Models
                  </button>
                </div>
                <select 
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white font-semibold"
                  value={localAgentModel}
                  onChange={(e) => setLocalAgentModel(e.target.value)}
                >
                  {agentModelOptions.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.id === DEFAULT_AGENT_MODEL ? `${DEFAULT_AGENT_MODEL_NAME} — mặc định` : m.name}
                    </option>
                  ))}
                </select>
              </div>

              {localAgentModel && (
                <div className="pt-2">
                  <button 
                    className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                      testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'success' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-100' 
                        : testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                    }`}
                    onClick={() => testModel(localAgentProvider, localCredentialId, localAgentModel)}
                    disabled={!selectedAgentCredentialIsUsable || testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'loading'}
                  >
                    {testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'loading' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra...
                      </>
                    ) : testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'success' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Model sẵn sàng
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="h-3.5 w-3.5" /> Kiểm tra Model ngay
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-neutral-400 mt-2 text-center italic">
                    Hành động này sẽ gửi một yêu cầu mẫu để xác thực model đang chọn.
                  </p>
                </div>
              )}
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={localMemoryEnabled}
              onClick={() => setLocalMemoryEnabled(!localMemoryEnabled)}
              className={`text-left rounded-xl border p-3 transition-colors ${localMemoryEnabled ? 'border-indigo-200 bg-indigo-50/60' : 'border-neutral-200 bg-neutral-50'}`}
            >
              <div className="text-xs font-bold text-neutral-800">Bộ nhớ dài hạn</div>
              <div className="text-[10px] text-neutral-500 mt-1">{localMemoryEnabled ? 'Đang bật capability Memory cho Agent.' : 'Agent sẽ không nhận capability Memory.'}</div>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={localWebSearchEnabled}
              onClick={() => setLocalWebSearchEnabled(!localWebSearchEnabled)}
              className={`text-left rounded-xl border p-3 transition-colors ${localWebSearchEnabled ? 'border-indigo-200 bg-indigo-50/60' : 'border-neutral-200 bg-neutral-50'}`}
            >
              <div className="text-xs font-bold text-neutral-800">Tìm kiếm Web</div>
              <div className="text-[10px] text-neutral-500 mt-1">{localWebSearchEnabled ? 'Agent được phép dùng capability Search nếu tài khoản có web.search.' : 'Search bị tắt trong AgentConfig.'}</div>
            </button>
          </div>
        </div>
      </Card>

      {/* Thiết lập chung */}
      <Card className="p-4 bg-white border border-neutral-200">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-5 w-5 text-neutral-700" />
          <h2 className="text-base font-semibold text-neutral-900">Thiết lập chung</h2>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-neutral-100">
          <div>
            <div className="text-sm font-medium text-neutral-900">Model mặc định toàn hệ thống</div>
            <div className="text-xs text-neutral-500">Dùng cho các tác vụ nền nếu không có model riêng</div>
          </div>
          <select 
            className="text-sm border border-neutral-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            value={localGlobalDefaultModel || ''}
            onChange={(e) => setLocalGlobalDefaultModel(e.target.value || null)}
          >
            <option value="">-- Không chọn --</option>
            {Object.values(store.providerLoadedModels).flat().map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between pt-4">
          <div>
            <div className="text-sm font-medium text-neutral-900">Xoay vòng API Key (Quota Rotation)</div>
            <div className="text-xs text-neutral-500">Chỉ rotate giữa các API Key cá nhân cùng provider khi lỗi xác thực/quota xảy ra trước khi response bắt đầu; không tự rơi sang System Key.</div>
          </div>
          <button 
            type="button"
            role="switch"
            aria-checked={localAutoRotate}
            onClick={() => setLocalAutoRotate(!localAutoRotate)}
            className={`${
              localAutoRotate ? 'bg-neutral-900' : 'bg-neutral-200'
            } relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
          >
            <span
              aria-hidden="true"
              className={`${
                localAutoRotate ? 'translate-x-4' : 'translate-x-0'
              } pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>
      </Card>

      {/* Danh sách nhà cung cấp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SUPPORTED_PROVIDERS.map((provider) => {
          const providerKeys = store.keys.filter(k => k.providerId === provider.id);
          
          return (
            <Card key={provider.id} className="p-4 bg-white border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900">{provider.name}</h3>
                </div>
              </div>

              {/* Danh sách keys */}
              <div className="space-y-2 mb-4">
                {providerKeys.length === 0 ? (
                  <div className="text-[11px] text-neutral-400 italic py-2 px-3 bg-neutral-50 rounded border border-dashed border-neutral-200">
                    {provider.id === 'google' ? 'Chưa có API Key cá nhân. Google có thể dùng System Key.' : 'Chưa có API Key cá nhân. Provider này không có System Key; hãy thêm key riêng.'}
                  </div>
                ) : (
                  providerKeys.map((keyEntry) => {
                    const isConfirming = confirmDeleteId === keyEntry.id;
                    const isTesting = testingKeyId === keyEntry.id;
                    
                    return (
                    <div key={keyEntry.id} className="relative flex items-center gap-2 p-2 rounded-md border border-neutral-100 bg-neutral-50/50">
                      {isConfirming && (
                        <div className="absolute inset-0 z-10 bg-white/95 flex items-center justify-between px-3 rounded-md border border-red-100">
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span className="text-[10px] font-bold uppercase">Xác nhận xóa?</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button className="text-[10px] text-neutral-500 font-bold px-2 py-1" onClick={() => setConfirmDeleteId(null)}>Hủy</button>
                            <button className="text-[10px] bg-red-600 text-white font-bold px-2 py-1 rounded" onClick={() => removeLocalKey(keyEntry.id)}>XÓA</button>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 px-2">
                          <Key className="h-3 w-3 text-neutral-400" />
                          <span className="text-xs font-medium text-neutral-700 truncate">{keyEntry.name}</span>
                        </div>
                      </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                          className={`h-6 px-2 text-[10px] font-bold uppercase tracking-tight border rounded transition-all flex items-center gap-1 ${
                            testStatuses[`refresh_${keyEntry.id}`] === 'success' 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                              : testStatuses[`refresh_${keyEntry.id}`] === 'error'
                              ? 'bg-red-50 border-red-200 text-red-600'
                              : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                          }`}
                          onClick={() => refreshModels(provider.id, keyEntry.id)}
                          disabled={testStatuses[`refresh_${keyEntry.id}`] === 'loading'}
                        >
                          {testStatuses[`refresh_${keyEntry.id}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                           testStatuses[`refresh_${keyEntry.id}`] === 'success' ? <CheckCircle2 className="h-3 w-3" /> :
                           "Models"}
                        </button>
                        <button
                          className="h-6 w-6 flex items-center justify-center text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                          onClick={() => setConfirmDeleteId(keyEntry.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )})
                )}
              </div>

              {/* Thêm Key Mới */}
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                <input
                  type="password"
                  placeholder={`Nhập API Key ${provider.name}...`}
                  className="flex-1 text-xs border border-neutral-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono bg-neutral-50/50"
                  value={newKeyInputs[provider.id] || ''}
                  onChange={(e) => setNewKeyInputs({ ...newKeyInputs, [provider.id]: e.target.value })}
                />
                <Button 
                  variant="default" 
                  size="sm"
                  className={`h-7 text-[10px] font-bold transition-all ${
                    testStatuses[`new_${provider.id}`] === 'success' 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : testStatuses[`new_${provider.id}`] === 'error'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-neutral-900'
                  }`}
                  onClick={() => handleAddAndTestKey(provider.id)}
                  disabled={!newKeyInputs[provider.id]?.trim() || testStatuses[`new_${provider.id}`] === 'loading'}
                >
                  {testStatuses[`new_${provider.id}`] === 'loading' ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : testStatuses[`new_${provider.id}`] === 'success' ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  {testStatuses[`new_${provider.id}`] === 'success' ? 'ĐÃ THÊM' : 'THÊM & KIỂM TRA'}
                </Button>
                {testStatuses[`new_${provider.id}`] === 'warning' && pendingKey?.providerId === provider.id && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-7 text-[10px] font-bold border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={saveUnverified}
                  >
                    LƯU CHƯA XÁC MINH
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

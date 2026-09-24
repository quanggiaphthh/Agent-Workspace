import React, { useEffect, useMemo, useState } from 'react';
import { useAIKeysStore, APIKeyEntry, isAgentCredentialUsable } from './aiKeysStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_MODEL_NAME,
  DEFAULT_AGENT_PROVIDER,
  isAgentModelId,
} from '../../../shared/contracts/ai';

export function AgentAIManagerTab() {
  const store = useAIKeysStore();
  const { user, loading: authLoading } = useFirebaseAuth();

  // Keep the existing settings authority and draft/save behavior. W9 only narrows the primary UI.
  const [localKeys, setLocalKeys] = useState<APIKeyEntry[]>([]);
  const [localAutoRotate, setLocalAutoRotate] = useState(false);
  const [localGlobalDefaultModel, setLocalGlobalDefaultModel] = useState<string | null>(null);
  const [localAgentProvider] = useState(DEFAULT_AGENT_PROVIDER);
  const [localAgentModel, setLocalAgentModel] = useState<string>(DEFAULT_AGENT_MODEL);
  const [localMemoryEnabled, setLocalMemoryEnabled] = useState(true);
  const [localWebSearchEnabled, setLocalWebSearchEnabled] = useState(false);
  const [localProviderDefaultModels, setLocalProviderDefaultModels] = useState<Record<string, string>>({});
  const [localCredentialId, setLocalCredentialId] = useState('system');

  const [newKeyInputs, setNewKeyInputs] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingKey, setPendingKey] = useState<{ providerId: string; key: string; name: string } | null>(null);
  const [testStatuses, setTestStatuses] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error' | 'warning'>>({});

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
    store.providerDefaultModels,
  ]);

  const googleKeys = useMemo(
    () => store.keys.filter((key) => key.providerId === DEFAULT_AGENT_PROVIDER),
    [store.keys],
  );
  const agentCredentialOptions = useMemo(
    () => googleKeys.filter((key) => key.status === 'active'),
    [googleKeys],
  );
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

  const hasChanges = useMemo(
    () =>
      JSON.stringify(localKeys) !== JSON.stringify(store.keys) ||
      localAutoRotate !== store.autoRotate ||
      localGlobalDefaultModel !== store.globalDefaultModel ||
      store.agentProvider !== DEFAULT_AGENT_PROVIDER ||
      localAgentModel !== store.agentModel ||
      localCredentialId !== store.credentialId ||
      localMemoryEnabled !== store.memoryEnabled ||
      localWebSearchEnabled !== store.webSearchEnabled,
    [
      localKeys,
      store.keys,
      localAutoRotate,
      store.autoRotate,
      localGlobalDefaultModel,
      store.globalDefaultModel,
      store.agentProvider,
      localAgentModel,
      store.agentModel,
      localCredentialId,
      store.credentialId,
      localMemoryEnabled,
      store.memoryEnabled,
      localWebSearchEnabled,
      store.webSearchEnabled,
    ],
  );

  const agentReady = Boolean(
    user &&
      !authLoading &&
      store.aiSettingsHydrated &&
      localAgentProvider === DEFAULT_AGENT_PROVIDER &&
      isAgentModelId(localAgentModel) &&
      selectedAgentCredentialIsUsable,
  );

  const setStatus = (id: string, status: 'idle' | 'loading' | 'success' | 'error' | 'warning') => {
    setTestStatuses((prev) => ({ ...prev, [id]: status }));
  };

  const handleSave = () => {
    setIsSaving(true);
    useAIKeysStore.setState({
      autoRotate: localAutoRotate,
      globalDefaultModel: localGlobalDefaultModel,
      agentProvider: DEFAULT_AGENT_PROVIDER,
      agentModel: localAgentModel || DEFAULT_AGENT_MODEL,
      credentialId: localCredentialId,
      memoryEnabled: localMemoryEnabled,
      webSearchEnabled: localWebSearchEnabled,
      providerDefaultModels: localProviderDefaultModels,
    });
    setTimeout(() => setIsSaving(false), 500);
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

  const testConnection = async (key: string, providerId: string) => {
    try {
      const sanitizedKey = key?.trim() || '';
      const response = await authFetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, key: sanitizedKey }),
      });
      const data = await response.json();
      return { ...data, ok: response.ok };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối mạng', ok: false };
    }
  };

  const refreshModels = async (providerId: string, credentialId: string) => {
    setStatus(`refresh_${credentialId}`, 'loading');
    try {
      const params = new URLSearchParams({ providerId, credentialId });
      const response = await authFetch(`/api/ai/models?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Không thể tải danh sách mô hình');
      if (data.models) {
        store.setProviderLoadedModels(providerId, data.models);
        if (data.models.length > 0 && providerId === localAgentProvider) {
          const exists = data.models.some((model: any) => model.id === localAgentModel);
          if (!exists && localAgentModel !== DEFAULT_AGENT_MODEL) setLocalAgentModel(DEFAULT_AGENT_MODEL);
        }
      }
      setStatus(`refresh_${credentialId}`, 'success');
      setTimeout(() => setStatus(`refresh_${credentialId}`, 'idle'), 3000);
    } catch {
      setStatus(`refresh_${credentialId}`, 'error');
      alert('Không thể tải danh sách mô hình. Vui lòng kiểm tra kết nối và thử lại.');
    }
  };

  const handleAddAndTestKey = async (providerId: string) => {
    const value = newKeyInputs[providerId];
    if (!value?.trim()) return;

    setPendingKey(null);
    setStatus(`new_${providerId}`, 'loading');
    try {
      const data = await testConnection(value.trim(), providerId);
      if (data.ok && data.success) {
        await store.addKey(providerId, value.trim(), `Khóa Gemini ${new Date().toLocaleDateString()}`);
        if (data.models) store.setProviderLoadedModels(providerId, data.models);
        setNewKeyInputs({ ...newKeyInputs, [providerId]: '' });
        setStatus(`new_${providerId}`, 'success');
        setTimeout(() => setStatus(`new_${providerId}`, 'idle'), 3000);
      } else if (data.canSaveUnverified) {
        setPendingKey({
          providerId,
          key: value.trim(),
          name: `Khóa Gemini ${new Date().toLocaleDateString()}`,
        });
        setStatus(`new_${providerId}`, 'warning');
        alert('Chưa thể xác minh khóa lúc này. Bạn có thể lưu khóa và kiểm tra lại sau.');
      } else {
        throw new Error('Không thể xác minh khóa');
      }
    } catch {
      setStatus(`new_${providerId}`, 'error');
      alert('Không thể kiểm tra khóa Gemini. Vui lòng kiểm tra lại và thử lại.');
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
    } catch {
      alert('Không thể lưu khóa Gemini. Vui lòng thử lại.');
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
        body: JSON.stringify({ providerId, credentialId, modelId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('Model test failed');
      setStatus(testId, 'success');
      setTimeout(() => setStatus(testId, 'idle'), 3000);
    } catch {
      setStatus(testId, 'error');
      alert('Không thể kết nối với mô hình đã chọn. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-neutral-50/80 backdrop-blur-md border-b border-neutral-200 mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900">Thiết lập Trợ lý AI</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Chọn mô hình, khóa truy cập và các tính năng hỗ trợ.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasChanges || isSaving}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Hoàn tác
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Lưu thiết lập
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-neutral-200 shadow-sm bg-white">
        <div className="bg-indigo-50/50 border-b border-indigo-100/50 px-4 py-3 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-neutral-900">Trợ lý AI</h3>
        </div>

        <div className="p-5 space-y-6">
          <div className={`rounded-xl border px-4 py-3 ${agentReady ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className={`text-xs font-bold ${agentReady ? 'text-emerald-800' : 'text-amber-800'}`}>
              {agentReady ? 'Trợ lý đã sẵn sàng' : 'Trợ lý cần được thiết lập'}
            </div>
            <div className="text-[11px] text-neutral-600 mt-1">
              Gemini · {localAgentModel === DEFAULT_AGENT_MODEL ? DEFAULT_AGENT_MODEL_NAME : localAgentModel}
              {selectedAgentCredentialIsUsable
                ? ` · ${localCredentialId === 'system' ? 'Khóa dùng chung' : (agentCredentialOptions.find((key) => key.id === localCredentialId)?.name || 'Khóa cá nhân')}`
                : ' · Chưa có khóa truy cập khả dụng'}
            </div>
            {!selectedAgentCredentialIsUsable && store.systemCredentialAvailable !== null && (
              <p className="text-[10px] text-amber-700 mt-1">Hãy chọn khóa dùng chung hoặc thêm khóa Gemini cá nhân.</p>
            )}
            {store.credentialSyncError && (
              <p className="text-[10px] text-red-700 mt-1">Không thể đồng bộ trạng thái khóa truy cập. Vui lòng thử lại sau.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Dịch vụ AI</label>
                <div className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2.5 bg-neutral-50 text-neutral-700 font-medium">
                  Google Gemini
                </div>
                <p className="text-[10px] text-neutral-500">Agent-Workspace hiện sử dụng Gemini cho Trợ lý AI.</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Khóa truy cập</label>
                  <button
                    className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                      testStatuses[`test_${localCredentialId}`] === 'success'
                        ? 'text-emerald-600'
                        : testStatuses[`test_${localCredentialId}`] === 'error'
                          ? 'text-red-600'
                          : 'text-indigo-600 hover:text-indigo-700'
                    }`}
                    onClick={async () => {
                      const testId = `test_${localCredentialId}`;
                      setStatus(testId, 'loading');
                      try {
                        const response = await authFetch(`/api/ai/models?providerId=${localAgentProvider}&credentialId=${localCredentialId}`);
                        const data = await response.json();
                        if (!data.success) throw new Error('Connection failed');
                        setStatus(testId, 'success');
                        setTimeout(() => setStatus(testId, 'idle'), 3000);
                      } catch {
                        setStatus(testId, 'error');
                        alert('Không thể xác minh khóa truy cập. Vui lòng thử lại.');
                      }
                    }}
                    disabled={!selectedAgentCredentialIsUsable || testStatuses[`test_${localCredentialId}`] === 'loading'}
                  >
                    {testStatuses[`test_${localCredentialId}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> :
                      testStatuses[`test_${localCredentialId}`] === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                    {testStatuses[`test_${localCredentialId}`] === 'success' ? 'Đã kết nối' : 'Kiểm tra kết nối'}
                  </button>
                </div>
                <select
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-neutral-50/30 font-medium"
                  value={selectedAgentCredentialIsUsable ? localCredentialId : '__none__'}
                  onChange={(event) => { if (event.target.value !== '__none__') setLocalCredentialId(event.target.value); }}
                  aria-label="Chọn khóa truy cập Gemini"
                >
                  {!selectedAgentCredentialIsUsable && (
                    <option value="__none__" disabled>
                      {store.systemCredentialAvailable === null ? 'Đang kiểm tra khóa truy cập…' : 'Chưa có khóa truy cập khả dụng'}
                    </option>
                  )}
                  {store.systemCredentialAvailable === true && <option value="system">Khóa dùng chung</option>}
                  {agentCredentialOptions.map((key) => <option key={key.id} value={key.id}>{key.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4 bg-neutral-50/50 p-4 rounded-xl border border-neutral-100">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Mô hình</label>
                  <button
                    className="text-[11px] font-semibold flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                    onClick={() => refreshModels(localAgentProvider, localCredentialId)}
                    disabled={!selectedAgentCredentialIsUsable || testStatuses[`refresh_${localCredentialId}`] === 'loading'}
                  >
                    {testStatuses[`refresh_${localCredentialId}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> :
                      testStatuses[`refresh_${localCredentialId}`] === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                    Làm mới danh sách
                  </button>
                </div>
                <select
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-semibold"
                  value={localAgentModel}
                  onChange={(event) => setLocalAgentModel(event.target.value)}
                  aria-label="Chọn mô hình Gemini"
                >
                  {agentModelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id === DEFAULT_AGENT_MODEL ? `${DEFAULT_AGENT_MODEL_NAME} — mặc định` : model.name}
                    </option>
                  ))}
                </select>
              </div>

              {localAgentModel && (
                <button
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                    testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
                  }`}
                  onClick={() => testModel(localAgentProvider, localCredentialId, localAgentModel)}
                  disabled={!selectedAgentCredentialIsUsable || testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'loading'}
                >
                  {testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'loading' ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra…</>
                  ) : testStatuses[`test_model_${localCredentialId}_${localAgentModel}`] === 'success' ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Kết nối tốt</>
                  ) : (
                    <><BrainCircuit className="h-3.5 w-3.5" /> Kiểm tra mô hình</>
                  )}
                </button>
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
              <div className="text-xs font-bold text-neutral-800">Ghi nhớ thông tin hữu ích</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {localMemoryEnabled ? 'Trợ lý có thể sử dụng thông tin đã ghi nhớ để hỗ trợ nhất quán hơn.' : 'Trợ lý sẽ không sử dụng thông tin đã ghi nhớ.'}
              </div>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={localWebSearchEnabled}
              onClick={() => setLocalWebSearchEnabled(!localWebSearchEnabled)}
              className={`text-left rounded-xl border p-3 transition-colors ${localWebSearchEnabled ? 'border-indigo-200 bg-indigo-50/60' : 'border-neutral-200 bg-neutral-50'}`}
            >
              <div className="text-xs font-bold text-neutral-800">Tìm kiếm trên web</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {localWebSearchEnabled ? 'Cho phép Trợ lý tìm thông tin trên web khi cần.' : 'Trợ lý sẽ không sử dụng tìm kiếm web.'}
              </div>
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-white border border-neutral-200">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-neutral-600" />
          <h3 className="text-sm font-semibold text-neutral-900">Khóa Gemini cá nhân</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">Thêm khóa cá nhân nếu bạn không muốn dùng khóa dùng chung hoặc cần một khóa riêng.</p>

        <div className="space-y-2 mb-4">
          {googleKeys.length === 0 ? (
            <div className="text-[11px] text-neutral-500 py-3 px-3 bg-neutral-50 rounded border border-dashed border-neutral-200">
              Chưa có khóa Gemini cá nhân.
            </div>
          ) : (
            googleKeys.map((keyEntry) => {
              const isConfirming = confirmDeleteId === keyEntry.id;
              const isTesting = testingKeyId === keyEntry.id;
              return (
                <div key={keyEntry.id} className="relative flex items-center gap-2 p-2 rounded-md border border-neutral-100 bg-neutral-50/50">
                  {isConfirming && (
                    <div className="absolute inset-0 z-10 bg-white/95 flex items-center justify-between px-3 rounded-md border border-red-100">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold">Xóa khóa này?</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="text-[10px] text-neutral-500 font-bold px-2 py-1" onClick={() => setConfirmDeleteId(null)}>Hủy</button>
                        <button className="text-[10px] bg-red-600 text-white font-bold px-2 py-1 rounded" onClick={() => removeLocalKey(keyEntry.id)}>Xóa</button>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex items-center gap-2 px-2">
                    <Key className="h-3 w-3 text-neutral-400" />
                    <span className="text-xs font-medium text-neutral-700 truncate">{keyEntry.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="h-7 px-2 text-[10px] font-bold border rounded bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900"
                      onClick={async () => {
                        setTestingKeyId(keyEntry.id);
                        try {
                          const response = await authFetch(`/api/ai/models?providerId=${DEFAULT_AGENT_PROVIDER}&credentialId=${keyEntry.id}`);
                          const data = await response.json();
                          alert(response.ok && data.success ? 'Khóa Gemini hoạt động bình thường.' : 'Không thể xác minh khóa Gemini.');
                        } catch {
                          alert('Không thể xác minh khóa Gemini.');
                        } finally {
                          setTestingKeyId(null);
                        }
                      }}
                      disabled={isTesting}
                    >
                      {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Kiểm tra'}
                    </button>
                    <button
                      className="h-7 w-7 flex items-center justify-center text-neutral-400 hover:text-red-600 rounded hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(keyEntry.id)}
                      aria-label={`Xóa ${keyEntry.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-neutral-100">
          <input
            type="password"
            placeholder="Nhập khóa Gemini cá nhân"
            className="flex-1 text-xs border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-neutral-50/50"
            value={newKeyInputs[DEFAULT_AGENT_PROVIDER] || ''}
            onChange={(event) => setNewKeyInputs({ ...newKeyInputs, [DEFAULT_AGENT_PROVIDER]: event.target.value })}
            aria-label="Khóa Gemini cá nhân mới"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => handleAddAndTestKey(DEFAULT_AGENT_PROVIDER)}
            disabled={!newKeyInputs[DEFAULT_AGENT_PROVIDER]?.trim() || testStatuses[`new_${DEFAULT_AGENT_PROVIDER}`] === 'loading'}
          >
            {testStatuses[`new_${DEFAULT_AGENT_PROVIDER}`] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Thêm và kiểm tra
          </Button>
          {testStatuses[`new_${DEFAULT_AGENT_PROVIDER}`] === 'warning' && pendingKey?.providerId === DEFAULT_AGENT_PROVIDER && (
            <Button variant="outline" size="sm" onClick={saveUnverified}>Lưu để kiểm tra sau</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

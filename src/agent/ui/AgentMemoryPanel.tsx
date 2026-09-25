import React, { useEffect, useState } from 'react';
import { AlertCircle, Brain, Check, Clock, Edit3, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { authFetch } from '../../lib/authFetch';
import { useContextStore } from '../../core/context/contextStore';
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

interface AgentMemory { id: string; content: string; category: string; status: 'approved' | 'pending'; source?: string; createdAt?: any; }

export function AgentMemoryPanel() {
  const { user } = useFirebaseAuth();
  const appUser = useContextStore(state => state.user);
  const memoryEnabled = useAIKeysStore(state => state.memoryEnabled);
  const setMemoryEnabled = useAIKeysStore(state => state.setMemoryEnabled);
  const canWrite = appUser.permissions.includes('memory.write') || appUser.roles.includes('admin');
  const canDelete = appUser.permissions.includes('memory.delete') || appUser.roles.includes('admin');
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState('Người dùng');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const fetchMemories = async () => {
    if (!user) { setMemories([]); setLoading(false); return; }
    try {
      setLoading(true);
      const response = await authFetch('/api/memory?status=all&limit=100');
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải bộ nhớ');
      const data = await response.json(); setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch (error) { console.error('Failed to fetch agent memories:', error); setMemories([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void fetchMemories(); }, [user]);

  const updateMemory = async (id: string, body: Record<string, unknown>) => {
    const response = await authFetch(`/api/memory/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.json()).error || 'Không thể cập nhật ghi nhớ');
  };
  const handleApprove = async (id: string) => { if (!canWrite) return; try { await updateMemory(id, { status: 'approved' }); setMemories(previous => previous.map(memory => memory.id === id ? { ...memory, status: 'approved' } : memory)); } catch (error) { console.error(error); } };
  const handleDelete = async (id: string) => { if (!canDelete) return; try { const response = await authFetch(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Không thể xóa ghi nhớ'); setMemories(previous => previous.filter(memory => memory.id !== id)); } catch (error) { console.error(error); } };
  const handleSaveEdit = async (id: string) => { if (!canWrite || !editText.trim()) return; try { await updateMemory(id, { content: editText.trim() }); setMemories(previous => previous.map(memory => memory.id === id ? { ...memory, content: editText.trim() } : memory)); setEditingId(null); } catch (error) { console.error(error); } };
  const handleAddMemory = async (event: React.FormEvent) => {
    event.preventDefault(); if (!newMemoryContent.trim() || !user || !canWrite) return;
    try { const response = await authFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newMemoryContent.trim(), category: newMemoryCategory, source: 'Nhập thủ công' }) }); if (!response.ok) throw new Error('Không thể thêm ghi nhớ'); setNewMemoryContent(''); setIsAdding(false); await fetchMemories(); } catch (error) { console.error(error); }
  };

  const filtered = memories.filter(memory => !searchKeyword.trim() || memory.content.toLocaleLowerCase('vi').includes(searchKeyword.toLocaleLowerCase('vi')) || memory.category.toLocaleLowerCase('vi').includes(searchKeyword.toLocaleLowerCase('vi')));
  const pending = filtered.filter(memory => memory.status === 'pending');
  const approved = filtered.filter(memory => memory.status === 'approved');

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-50/50 overflow-y-auto p-4 space-y-4">
      <div className="bg-white p-3.5 rounded-xl border border-neutral-200 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center"><Brain className="h-4 w-4" /></div><div><h3 className="text-xs font-bold text-neutral-900">Bộ nhớ</h3><p className="text-[10px] text-neutral-500">Thông tin Trợ lý có thể dùng trong các Hội thoại</p></div></div><button type="button" role="switch" aria-checked={memoryEnabled} onClick={() => setMemoryEnabled(!memoryEnabled)} className={`min-h-10 px-3 rounded-full text-[11px] font-medium border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${memoryEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>{memoryEnabled ? 'Đang bật' : 'Đang tắt'}</button></div>
        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100"><div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" /><input type="search" value={searchKeyword} onChange={event => setSearchKeyword(event.target.value)} placeholder="Tìm trong Bộ nhớ..." aria-label="Tìm trong Bộ nhớ" className="w-full pl-8 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-500" /></div>{canWrite && <Button size="sm" onClick={() => setIsAdding(!isAdding)} className="text-xs bg-neutral-900 text-white h-9 px-3"><Plus className="h-3 w-3 mr-1" />Thêm</Button>}</div>
      </div>

      {isAdding && canWrite && <form onSubmit={handleAddMemory} className="bg-white p-3.5 rounded-xl border border-neutral-200 space-y-3"><div className="text-xs font-bold text-neutral-800">Thêm ghi nhớ</div><textarea rows={3} value={newMemoryContent} onChange={event => setNewMemoryContent(event.target.value)} placeholder="Nhập thông tin cần ghi nhớ..." className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-500 resize-none" /><div className="flex items-center justify-between gap-2"><select value={newMemoryCategory} onChange={event => setNewMemoryCategory(event.target.value)} className="text-xs px-2.5 py-2 rounded-lg border border-neutral-300 bg-white"><option>Người dùng</option><option>Công việc</option><option>Sở thích</option><option>Thói quen</option></select><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Hủy</Button><Button type="submit" size="sm" className="bg-neutral-900 text-white">Lưu</Button></div></div></form>}

      {!memoryEnabled && <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" /><span>Bộ nhớ đang tắt. Trợ lý sẽ không tham khảo hoặc cập nhật ghi nhớ mới.</span></div>}

      {pending.length > 0 && memoryEnabled && <section className="space-y-2" aria-labelledby="pending-memory-title"><h4 id="pending-memory-title" className="text-[11px] font-bold text-amber-700">Chờ bạn duyệt ({pending.length})</h4>{pending.map(memory => <div key={memory.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2"><div className="text-xs text-amber-900 font-medium">{memory.content}</div><div className="text-[10px] text-amber-700 flex items-center gap-1"><Clock className="h-3 w-3" />Nguồn: {memory.source || 'Hội thoại gần đây'}</div><div className="flex justify-end gap-1.5">{canWrite && <Button size="sm" onClick={() => void handleApprove(memory.id)} className="h-8 text-[10px] bg-emerald-600 text-white"><Check className="h-3 w-3 mr-1" />Duyệt</Button>}{canDelete && <Button variant="ghost" size="icon" onClick={() => void handleDelete(memory.id)} aria-label="Xóa đề xuất ghi nhớ" className="h-8 w-8 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>)}</section>}

      <section className="space-y-2" aria-labelledby="approved-memory-title"><h4 id="approved-memory-title" className="text-[11px] font-bold text-neutral-600">Đã ghi nhớ ({approved.length})</h4>{loading ? <div className="py-12 flex justify-center text-neutral-400"><Loader2 className="h-6 w-6 animate-spin" /></div> : approved.length === 0 ? <div className="p-8 text-center bg-white rounded-xl border border-neutral-200 text-neutral-400 text-xs">Không có ghi nhớ phù hợp.</div> : approved.map(memory => <div key={memory.id} className="p-3 bg-white rounded-xl border border-neutral-200 space-y-2">{editingId === memory.id ? <><textarea value={editText} onChange={event => setEditText(event.target.value)} className="w-full text-xs p-2 rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-500" rows={3} /><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Hủy</Button><Button size="sm" onClick={() => void handleSaveEdit(memory.id)} className="bg-neutral-900 text-white"><Save className="h-3 w-3 mr-1" />Lưu</Button></div></> : <><div className="text-xs text-neutral-800">{memory.content}</div><div className="text-[10px] text-neutral-500">{memory.category} · {memory.source || 'Hội thoại'}</div><div className="flex justify-end gap-1">{canWrite && <Button variant="ghost" size="icon" onClick={() => { setEditingId(memory.id); setEditText(memory.content); }} aria-label="Chỉnh sửa ghi nhớ" className="h-8 w-8"><Edit3 className="h-3.5 w-3.5" /></Button>}{canDelete && <Button variant="ghost" size="icon" onClick={() => void handleDelete(memory.id)} aria-label="Xóa ghi nhớ" className="h-8 w-8 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>}</div></>}</div>)}</section>
    </div>
  );
}

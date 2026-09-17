import React, { useState, useEffect } from 'react';
import { Brain, Check, Trash2, Plus, Sparkles, Clock, AlertCircle, Loader2, Search, Edit3, X, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

interface AgentMemory {
  id: string;
  content: string;
  category: string;
  status: 'approved' | 'pending';
  source?: string;
  createdAt?: any;
}

export function AgentMemoryPanel() {
  const { user } = useFirebaseAuth();
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    const key = user ? `uid_${user.uid}_agent_memory_enabled` : 'agent_memory_enabled';
    return localStorage.getItem(key) !== 'false';
  });
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState('Người dùng');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    const key = user ? `uid_${user.uid}_agent_memory_enabled` : 'agent_memory_enabled';
    localStorage.setItem(key, String(memoryEnabled));
  }, [memoryEnabled, user]);

  const fetchMemories = async () => {
    if (!user) {
      setMemories([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, 'agent_memories'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const items: AgentMemory[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          content: data.content || '',
          category: data.category || 'Người dùng',
          status: data.status || 'approved',
          source: data.source || 'Cuộc hội thoại ngày gần nhất',
          createdAt: data.createdAt,
        });
      });

      setMemories(items);
    } catch (err) {
      console.error('Failed to fetch agent memories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedSampleData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const defaultMemories = [
        { userId: user.uid, content: 'Người dùng thích giao diện gọn gàng, tone màu trung tính tinh tế.', category: 'Sở thích', status: 'approved', source: 'Cuộc hội thoại ngày hôm nay', createdAt: new Date().toISOString() },
        { userId: user.uid, content: 'Ưu tiên quản lý công việc và nhiệm vụ cá nhân thông qua phân hệ Tasks.', category: 'Công việc', status: 'approved', source: 'Cuộc hội thoại ngày hôm qua', createdAt: new Date().toISOString() },
        { userId: user.uid, content: 'Đề xuất: Người dùng thường làm việc vào buổi tối từ 20h - 23h.', category: 'Thói quen', status: 'pending', source: 'Cuộc hội thoại tự động phát hiện', createdAt: new Date().toISOString() },
      ];
      for (const m of defaultMemories) {
        await addDoc(collection(db, 'agent_memories'), m);
      }
      await fetchMemories();
    } catch (err) {
      console.error('Failed to seed sample memories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, [user]);

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'agent_memories', id), { status: 'approved' });
      setMemories(prev => prev.map(m => m.id === id ? { ...m, status: 'approved' } : m));
    } catch (err) {
      console.error('Failed to approve memory:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'agent_memories', id));
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return;
    try {
      await updateDoc(doc(db, 'agent_memories', id), { content: editText.trim() });
      setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editText.trim() } : m));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update memory:', err);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim() || !user) return;
    try {
      await addDoc(collection(db, 'agent_memories'), {
        userId: user.uid,
        content: newMemoryContent.trim(),
        category: newMemoryCategory,
        status: 'approved',
        source: 'Nhập thủ công',
        createdAt: serverTimestamp(),
      });
      setNewMemoryContent('');
      setIsAdding(false);
      fetchMemories();
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
  };

  const filteredMemories = memories.filter(m => {
    if (!searchKeyword.trim()) return true;
    return (
      m.content.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      m.category.toLowerCase().includes(searchKeyword.toLowerCase())
    );
  });

  const approvedMemories = filteredMemories.filter(m => m.status === 'approved');
  const pendingMemories = filteredMemories.filter(m => m.status === 'pending');

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-50/50 overflow-y-auto p-4 space-y-4">
      {/* Header and Toggle */}
      <div className="bg-white p-3.5 rounded-xl border border-neutral-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-neutral-900">Bộ nhớ AI Riêng biệt</h3>
              <p className="text-[10px] text-neutral-500">Ghi nhớ ngữ cảnh và sở thích người dùng</p>
            </div>
          </div>

          <button
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className="flex items-center gap-1.5 text-xs text-neutral-700 font-medium cursor-pointer"
            title={memoryEnabled ? 'Tắt bộ nhớ' : 'Bật bộ nhớ'}
          >
            <span className="text-[10px]">{memoryEnabled ? 'Đang bật' : 'Đã tắt'}</span>
            {memoryEnabled ? (
              <ToggleRight className="h-6 w-6 text-emerald-600" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-neutral-400" />
            )}
          </button>
        </div>

        {/* Search & Add controls */}
        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm kiếm trong bộ nhớ..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <Button
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
            className="text-xs bg-neutral-900 text-white h-7 px-2.5 rounded-lg shrink-0"
          >
            <Plus className="h-3 w-3 mr-1" /> Thêm
          </Button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddMemory} className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
          <div className="text-xs font-bold text-neutral-800">Thêm tri thức / ghi nhớ mới cho Agent</div>
          <textarea
            rows={2}
            value={newMemoryContent}
            onChange={(e) => setNewMemoryContent(e.target.value)}
            placeholder="Nhập thông tin cần Agent ghi nhớ..."
            className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
          />
          <div className="flex items-center justify-between">
            <select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white"
            >
              <option value="Người dùng">Người dùng</option>
              <option value="Công việc">Công việc</option>
              <option value="Sở thích">Sở thích</option>
              <option value="Thói quen">Thói quen</option>
            </select>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="text-xs h-7">
                Hủy
              </Button>
              <Button type="submit" size="sm" className="text-xs bg-neutral-900 text-white h-7">
                Lưu
              </Button>
            </div>
          </div>
        </form>
      )}

      {!memoryEnabled && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Bộ nhớ AI đang tạm tắt. Trợ lý sẽ không tham khảo hoặc cập nhật ghi nhớ mới.</span>
        </div>
      )}

      {/* Pending Memory Proposals */}
      {pendingMemories.length > 0 && memoryEnabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1 uppercase tracking-wider font-mono">
              <Sparkles className="h-3 w-3" /> Đề xuất ghi nhớ chờ duyệt ({pendingMemories.length})
            </span>
          </div>
          <div className="space-y-2">
            {pendingMemories.map((m) => (
              <div key={m.id} className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2">
                <div className="text-xs text-amber-900 font-medium">{m.content}</div>
                <div className="text-[10px] text-amber-700 font-mono flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Nguồn: {m.source || 'Cuộc hội thoại gần đây'}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                  <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    {m.category}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(m.id)}
                      className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      <Check className="h-3 w-3" /> Phê duyệt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="h-6 px-2 text-[10px] text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved Memories List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider font-mono">
            Tri thức đã ghi nhớ ({approvedMemories.length})
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : approvedMemories.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-neutral-200 text-neutral-400 text-xs flex flex-col items-center justify-center space-y-3">
            <span>Không tìm thấy ghi nhớ nào phù hợp.</span>
            {memories.length === 0 && (
              <Button onClick={handleSeedSampleData} variant="outline" className="text-[11px] h-7 gap-1 bg-white border-neutral-300 hover:border-neutral-800 text-neutral-800">
                <Sparkles className="h-3 w-3" />
                Tạo dữ liệu mẫu
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {approvedMemories.map((m) => {
              const isEditing = editingId === m.id;
              return (
                <div key={m.id} className="p-3 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full text-xs p-2 rounded border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-none"
                        rows={2}
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 text-[10px]">
                          Hủy
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(m.id)} className="h-6 text-[10px] bg-neutral-900 text-white">
                          <Save className="h-3 w-3 mr-1" /> Lưu
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-neutral-800">{m.content}</div>
                      <div className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Nguồn: {m.source || 'Cuộc hội thoại'}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
                        <span className="text-[10px] font-mono bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                          {m.category}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditText(m.content);
                            }}
                            className="h-6 w-6 text-neutral-400 hover:text-neutral-900"
                            title="Chỉnh sửa ghi nhớ"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(m.id)}
                            className="h-6 w-6 text-neutral-400 hover:text-rose-600"
                            title="Xóa ghi nhớ"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

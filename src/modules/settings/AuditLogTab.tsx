import React, { useEffect, useState } from 'react';
import { AuditLogEntry } from '../../../shared/contracts/audit';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RefreshCw, Bot, User, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

export function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  const fetchLogs = async (cursor?: string, append = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const res = await authFetch(`/api/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items: AuditLogEntry[] = Array.isArray(data) ? data : (data.items || []);
        setLogs((prev) => append ? [...prev, ...items] : items);
        setNextCursor(Array.isArray(data) ? undefined : data.nextCursor);
      }
    } catch (err) {
      console.error('Failed fetching audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const riskBadge = (risk?: string) => {
    if (risk === 'high') return <Badge variant="danger">Rủi ro cao</Badge>;
    if (risk === 'medium') return <Badge variant="warning">Trung bình</Badge>;
    return <Badge variant="secondary">Thấp</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Nhật ký hoạt động hệ thống</h3>
          <p className="text-xs text-neutral-500">
            Ghi lại tất cả các tương tác của người dùng và các thực thi năng lực của Trợ lý với thông tin danh tính, thời gian và kết quả.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="text-xs gap-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Logs
        </Button>
      </div>

      <Card className="border-neutral-200 bg-white overflow-hidden shadow-xs">
        <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              {loading ? 'Đang tải nhật ký...' : 'Không tìm thấy nhật ký.'}
            </div>
          ) : (
            logs.map(log => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="p-3 hover:bg-neutral-50/70 transition-colors text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-neutral-400 text-[11px]">{log.id}</span>
                      <span className="font-semibold text-neutral-900">{log.action}</span>
                      <span className="text-neutral-400">•</span>
                      <span className="font-mono text-neutral-600 bg-neutral-100 px-1 py-0.5 rounded text-[11px]">
                        mod: {log.moduleId}
                      </span>
                      {riskBadge(log.risk)}
                      {log.agentInitiated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                          <Bot className="h-3 w-3" />
                          Trợ lý
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                          <User className="h-3 w-3" />
                          Người dùng
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-neutral-400 text-[11px]">
                        {new Date(log.timestamp).toLocaleString('vi-VN')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="h-6 px-2 text-[11px] text-neutral-600"
                      >
                        {isExpanded ? 'Ẩn chi tiết' : 'Kiểm tra'}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 p-2.5 rounded bg-neutral-900 text-neutral-100 font-mono text-[11px] space-y-2">
                      <div className="pb-2 border-b border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-300">
                        <div><span className="text-neutral-500">User ID:</span> {log.userId || 'N/A'}</div>
                        {log.userEmail && <div><span className="text-neutral-500">Email:</span> {log.userEmail}</div>}
                        <div><span className="text-neutral-500">Status:</span> <span className={log.status === 'success' ? 'text-emerald-400 font-bold' : log.status === 'denied' ? 'text-amber-400 font-bold' : 'text-rose-400'}>{log.status || 'N/A'}</span></div>
                        {log.target && <div><span className="text-neutral-500">Target:</span> {log.target}</div>}
                        {log.sessionId && <div><span className="text-neutral-500">Session ID:</span> {log.sessionId}</div>}
                        {log.toolCallId && <div><span className="text-neutral-500">Tool Call ID:</span> {log.toolCallId}</div>}
                        {typeof log.confirmed === 'boolean' && <div><span className="text-neutral-500">Confirmed:</span> {log.confirmed ? 'Yes' : 'No'}</div>}
                        {log.source && <div><span className="text-neutral-500">Source:</span> {log.source}</div>}
                      </div>
                      {log.metadata && (
                        <div>
                          <span className="text-neutral-400 font-bold block mb-0.5">// Metadata đã lược bỏ dữ liệu nhạy cảm</span>
                          <pre className="overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.errorMessage && (
                        <div className="pt-2 border-t border-neutral-800 text-rose-400">
                          <span className="font-bold block mb-0.5">// Thông báo lỗi</span>
                          <p>{log.errorMessage}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {nextCursor && (
          <div className="p-3 border-t border-neutral-100 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(nextCursor, true)}
              disabled={loading}
              className="text-xs"
            >
              Tải thêm nhật ký
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

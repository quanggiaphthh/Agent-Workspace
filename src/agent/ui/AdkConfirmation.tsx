import { useAdkToolConfirmations, useAdkConfirmTool } from "./AdkRuntimeProvider";
import { Button } from "../../components/ui/Button";
import { AlertTriangle, Check, X } from "lucide-react";

/**
 * AdkConfirmation
 * 
 * Renders the native ADK tool confirmations (HITL).
 */
export function AdkConfirmation() {
  const toolCalls = useAdkToolConfirmations();
  const confirmTool = useAdkConfirmTool();

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {toolCalls.map((tc: any) => (
        <div 
          key={tc.id} 
          className="p-4 border-2 border-amber-200 bg-amber-50 rounded-xl shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-full text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-amber-900 leading-tight">
                {tc.confirmation?.hint || 'Yêu cầu xác nhận'}
              </h4>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Bạn có chắc chắn muốn thực hiện hành động này?
              </p>
            </div>
          </div>

          {/* Show Arguments (Summary) */}
          <div className="bg-white/60 rounded-lg p-2.5 border border-amber-100 font-mono text-[10px] text-amber-900 break-all">
            <div className="font-bold uppercase tracking-wider text-[9px] text-amber-600 mb-1">Dữ liệu đầu vào:</div>
            {JSON.stringify(tc.args, null, 2)}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => confirmTool(tc.id, true)}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Xác nhận
            </Button>
            <Button
              variant="outline"
              onClick={() => confirmTool(tc.id, false)}
              className="flex-1 border-amber-300 text-amber-800 hover:bg-amber-100 h-9 text-xs gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

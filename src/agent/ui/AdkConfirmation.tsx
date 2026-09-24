import { useAdkToolConfirmations, useAdkConfirmTool } from "./AdkRuntimeProvider";
import { Button } from "../../components/ui/Button";
import { AlertTriangle, Check, X } from "lucide-react";

/**
 * Renders native ADK confirmations as human-facing decisions. Raw tool
 * arguments are intentionally not exposed in the primary UX.
 */
export function AdkConfirmation() {
  const toolCalls = useAdkToolConfirmations();
  const confirmTool = useAdkConfirmTool();

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {toolCalls.map((tc: any) => {
        const payload = tc.confirmation?.payload || {};
        const effect = typeof payload.effect === 'string' ? payload.effect : undefined;
        const risk = payload.risk === 'high' ? 'Mức ảnh hưởng cao' : payload.risk === 'medium' ? 'Có thay đổi dữ liệu' : undefined;

        return (
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
                  {tc.confirmation?.hint || 'Xác nhận thực hiện thao tác này?'}
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  {effect || 'Chỉ tiếp tục khi bạn đồng ý với thay đổi này.'}
                </p>
                {risk && (
                  <p className="text-[10px] text-amber-700 mt-1 font-medium">{risk}</p>
                )}
                {tc.recovered === true && (
                  <p className="text-[10px] text-amber-700 mt-1.5 leading-relaxed">
                    Yêu cầu này được khôi phục từ lịch sử. Máy chủ sẽ kiểm tra lại hiệu lực và phạm vi trước khi thực hiện quyết định của bạn.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => confirmTool(tc.id, true, tc.confirmation?.payload)}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                Xác nhận
              </Button>
              <Button
                variant="outline"
                onClick={() => confirmTool(tc.id, false, tc.confirmation?.payload)}
                className="flex-1 border-amber-300 text-amber-800 hover:bg-amber-100 h-9 text-xs gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Hủy bỏ
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

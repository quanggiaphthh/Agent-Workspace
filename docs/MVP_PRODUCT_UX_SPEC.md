# AGENT-WORKSPACE — MVP PRODUCT & UX SPEC

> Status: CANONICAL MVP TARGET — planning document  
> Audit source: GitHub `main` at `75e688269eb47228a963317223affcfd6ed1280f`  
> Date: 2026-09-22

## 1. MVP được khóa

MVP của Agent-Workspace gồm đúng ba lớp người dùng cần sử dụng được hằng ngày:

1. **Core Webapp ổn định** — App Shell, Auth/Owner, Settings, module composition/lifecycle, permissions, shared resource/file services, error/cancellation boundaries.
2. **Trợ lý AI xuyên suốt** — Google ADK + Gemini, persistent/temporary chat, history/recovery, streaming, attachment, capability execution, HITL.
3. **Công việc** — module nghiệp vụ tham chiếu đầu tiên, dùng được bằng UI trực tiếp và bằng Trợ lý AI.

Các module Tài liệu, Biên tập, Nghiên cứu, Định dạng văn bản hành chính và module tương lai **không thuộc MVP**. Chúng chỉ được phát triển sau khi Core + Agent + Công việc đạt acceptance gate.

## 2. Nguyên tắc sản phẩm

- Người dùng không cần thấy thuật ngữ kiến trúc như Core, Module Registry, Capability, Firestore, ADK, SSE, server-managed, Workspace Canvas.
- Kiến trúc modular phải rõ trong source nhưng gần như vô hình trong UX.
- Toàn bộ nội dung user-facing dùng tiếng Việt chuẩn. Tên riêng sản phẩm/dịch vụ chỉ giữ tiếng Anh khi thực sự cần.
- Một thao tác nghiệp vụ chỉ có một authority. UI và Agent dùng cùng domain service/capability path, không tạo implementation song song.
- Core không hard-code nghiệp vụ Công việc ngoài composition boundary được phê duyệt.
- MVP ưu tiên ổn định, lỗi dễ hiểu, responsive iPad/iPhone và workflow thực tế hơn dashboard/analytics trang trí.

## 3. Information architecture

### 3.1. Điều hướng MVP

- Trang chủ
- Công việc
- Cài đặt
- Trợ lý AI là workspace-level panel, không phải module/page thông thường.

Không hiển thị module tương lai dưới dạng Coming soon.

### 3.2. Bố cục desktop/iPad ngang

```text
+-------------+--------------------------------+--------------------+
| Điều hướng  | Không gian làm việc            | Trợ lý AI          |
| Trang chủ   |                                |                    |
| Công việc   |                                |                    |
|             |                                |                    |
| Cài đặt     |                                | Nhập yêu cầu...    |
+-------------+--------------------------------+--------------------+
```

- Sidebar khoảng 220–240 px.
- Agent panel khoảng 360–420 px và có thể thu gọn.
- Main workspace dùng phần còn lại.

### 3.3. Responsive

- iPad ngang: giữ 3 vùng nếu đủ chỗ.
- iPad dọc: sidebar thu gọn; Agent là drawer/panel.
- iPhone: một surface chính tại một thời điểm; ưu tiên bottom navigation `Trang chủ | Công việc | Trợ lý`, Cài đặt trong menu người dùng.

## 4. Trang chủ

Trang chủ phải là nơi bắt đầu làm việc, không phải trang giải thích kiến trúc.

### 4.1. Nội dung mục tiêu

- Lời chào ngắn.
- Ô yêu cầu nhanh cho Trợ lý AI.
- Tóm tắt Công việc hôm nay/quá hạn/sắp tới.
- Một số công việc cần chú ý.
- Hội thoại gần đây nếu dữ liệu sẵn có.

### 4.2. Loại bỏ khỏi production Home

- hero giải thích “Kiến trúc Phân hệ V1.0”;
- các card giải thích module isolation/capability/security;
- `Workspace Canvas`;
- `SERVER-MANAGED FIRESTORE`;
- card upload standalone lớn sau khi composer attachment hoàn thành.

Upload/file foundation vẫn là platform service; entry point người dùng chính chuyển vào composer Trợ lý AI.

## 5. Trợ lý AI

### 5.1. Header

Hiển thị `Trợ lý AI`; có thể có mô tả ngữ cảnh ngắn như `Đang hỗ trợ: Công việc` nếu hữu ích. Không hiển thị “Nền tảng Google AI”, “Phân hệ hiện tại” hoặc implementation detail.

### 5.2. Chat UX

- cuộc trò chuyện persistent;
- trò chuyện tạm thời;
- gửi/dừng phản hồi;
- history/recovery;
- attachment chip;
- action/HITL card;
- trạng thái lỗi/retry rõ ràng.

Không đặt `Bộ nhớ AI` và `Nhật ký` thành tab chính của chat MVP. Nếu cần quản lý/chẩn đoán, chuyển vào Cài đặt.

### 5.3. Empty state

`Tôi có thể giúp gì cho bạn?`

Mô tả: `Bạn có thể hỏi thông tin, quản lý công việc hoặc đính kèm tệp để tôi hỗ trợ xử lý.`

Gợi ý theo ngữ cảnh Công việc:

- `Hôm nay tôi có những việc gì?`
- `Tạo công việc “Chuẩn bị tài liệu họp” vào sáng mai.`
- `Những công việc nào đang quá hạn?`

### 5.4. Composer

Placeholder chuẩn: `Hỏi hoặc giao việc cho Trợ lý AI...`

Có: đính kèm, gửi, stop/cancel khi đang chạy. Không hiển thị `Google AI Studio Agent`.

### 5.5. Attachment

Workflow:

`Chọn tệp -> /api/files -> canonical fileId -> chip -> gửi chat -> server authorize -> bounded read -> invocation-only Gemini materialization -> SSE`.

Không persist binary/base64 vào durable history. MIME/size/security authority vẫn server-side.

## 6. Công việc — reference module của MVP

### 6.1. Mục tiêu

- tạo;
- sửa;
- chuyển trạng thái/hoàn thành;
- xóa có confirmation phù hợp;
- deadline;
- priority;
- tìm/lọc;
- Agent query/create/update/delete qua canonical capability execution.

### 6.2. UI mục tiêu

Header: `Công việc` + mô tả ngắn `Theo dõi và hoàn thành những việc cần làm.` + `+ Thêm công việc`.

Bỏ nhãn kỹ thuật `Server-managed Firestore`, `Cloud`, `Đồng bộ đám mây` khỏi normal UI.

Summary nên compact; không để bốn KPI card lớn chiếm phần lớn viewport.

Quick filters ưu tiên: `Tất cả | Hôm nay | Sắp tới | Quá hạn | Hoàn thành`.

Task row/card compact:

- checkbox/trạng thái;
- tiêu đề;
- mô tả ngắn khi cần;
- priority;
- deadline;
- category nếu thật sự hữu ích;
- menu `...` cho sửa/xóa thay vì trash icon luôn hiển thị.

### 6.3. Form

Ưu tiên drawer/sheet hoặc modal gọn:

- Tên công việc;
- Mô tả;
- Hạn hoàn thành;
- Mức ưu tiên;
- category chỉ giữ nếu có use case thực tế.

### 6.4. Empty/loading/error

Không dùng wording kỹ thuật như `Đang đồng bộ dữ liệu từ Firestore...`; dùng `Đang tải công việc...`.

Empty state: `Chưa có công việc nào. Tạo công việc đầu tiên hoặc yêu cầu Trợ lý AI tạo giúp.`

Dữ liệu mẫu/demo không nên xuất hiện trong production UX mặc định.

## 7. Cài đặt MVP

- Giao diện/cá nhân hóa cần thiết.
- AI/model/memory settings hiện có nếu thực sự user-controllable.
- Modules: hiển thị Công việc và trạng thái enable/disable.
- Diagnostics/system logs chỉ nằm ở khu vực nâng cao nếu cần.

MVP phải chứng minh: disable Công việc => navigation/routes/widgets/capabilities biến mất/fail closed; Core + Trợ lý vẫn hoạt động; re-enable hoạt động lại.

## 8. Command/Search palette

Thanh `Tìm kiếm & thao tác nhanh...` chỉ giữ nếu có chức năng rõ ràng. Mục tiêu là command/navigation palette (`⌘K`), không tạo Agent thứ hai.

Ví dụ: `Công việc`, `Cài đặt`, `Tạo công việc`, `Cuộc trò chuyện mới`.

## 9. Chuẩn thuật ngữ tiếng Việt user-facing

| Internal/hiện tại | User-facing chuẩn |
|---|---|
| Home | Trang chủ |
| Tasks / Task | Công việc |
| Settings | Cài đặt |
| Agent | Trợ lý AI |
| Temporary chat | Trò chuyện tạm thời |
| Upload | Tải tệp lên / Đính kèm tệp theo ngữ cảnh |
| Attachment | Tệp đính kèm |
| Retry | Thử lại |
| Cancel | Hủy |
| Delete | Xóa |
| Priority | Mức ưu tiên |
| Due date | Hạn hoàn thành |
| Status | Trạng thái |
| Logs | Nhật ký hệ thống |

Không hiển thị thông thường: `Workspace Canvas`, `Module/Phân hệ`, `Cloud`, `Server-managed Firestore`, `Google AI`, `Capability`, `Registry`.

## 10. Error UX

- History fail nhưng chat còn dùng được: `Chưa tải được lịch sử trò chuyện.` + `Thử lại`; không biến thành lỗi toàn hệ thống.
- Network: `Không thể kết nối. Vui lòng thử lại.`
- Agent timeout: `Trợ lý phản hồi quá thời gian cho phép.`
- Unsupported file: `Định dạng tệp chưa được hỗ trợ.`
- Oversized: `Tệp vượt giới hạn cho phép.`
- Module disabled: `Tính năng Công việc đang được tắt.`

Không expose stack trace/internal provider error cho người dùng.

## 11. Visual direction

- professional productivity workspace;
- typography rõ, spacing hợp lý, một accent color;
- giảm card/border lồng nhau;
- ít gradient/animation;
- tránh “AI demo aesthetic”;
- focus state/touch target phù hợp iPad;
- dark/light mode chỉ nếu infrastructure hiện có hỗ trợ ổn định.

## 12. MVP end-to-end workflows

### UI-first
`Mở app -> Công việc -> tạo/sửa/hoàn thành -> dữ liệu server -> UI cập nhật`.

### Agent-first
`Nêu yêu cầu -> Agent discover Task capability -> permission/HITL nếu cần -> CapabilityExecutionService -> Task domain -> result -> UI phản ánh`.

### File-assisted
`Đính kèm PDF/image/text -> canonical fileId -> authorize/bounded read -> Gemini hiểu file -> streamed answer`.

## 13. MVP acceptance gate

MVP chỉ LOCK khi có evidence:

1. app boot/reload ổn định;
2. Auth hoạt động;
3. Trang chủ usable;
4. Công việc CRUD usable;
5. Công việc enable/disable/re-enable không phá Core;
6. persistent chat hoạt động;
7. temporary chat đúng semantics;
8. Agent thực sự gọi Task capability;
9. HITL/reload/resume hoạt động;
10. cancellation/timeout/stale-run isolation giữ nguyên;
11. upload/attachment hoạt động;
12. Gemini thực sự hiểu attachment trong live probe;
13. history không leak binary/base64;
14. malformed/foreign/oversized file fail closed;
15. responsive iPad ngang/dọc và iPhone đạt usability cơ bản;
16. user-facing UI tiếng Việt nhất quán;
17. lỗi/loading/empty states dễ hiểu;
18. canonical GitHub CI PASS;
19. live Firebase/Gemini smoke test PASS;
20. không module nào bypass canonical authorities.

## 14. Ngoài MVP

Document Library hoàn chỉnh, DOCX editor, Research, Định dạng văn bản hành chính, RAG/vector DB, MCP runtime, marketplace/plugin installer, workflow engine, multi-user/team/collaboration/billing đều deferred.

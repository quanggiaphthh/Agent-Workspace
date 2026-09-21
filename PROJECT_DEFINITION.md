# AGENT-WORKSPACE — CANONICAL PRODUCT DEFINITION

> **Status:** CANONICAL PRODUCT INTENT / ARCHITECTURAL NORTH STAR  
> **Baseline when established:** `b979c0c7db2979582db47a794c02c4f52b36fa7c`  
> **Date:** 2026-09-22  
> **Scope:** single-user personal webapp; chưa public; Google AI Studio + Firebase + Gemini/ADK.

## 1. Định nghĩa dự án

Agent-Workspace là **webapp framework cá nhân theo kiến trúc modular**, gồm:

1. **Core Webapp ổn định** — app shell, identity/owner, settings, module lifecycle/registry, permissions, persistence/infrastructure, error/cancellation boundaries và các shared contracts;
2. **Agent Chatbox / Agent Runtime** — giao diện tương tác AI trung tâm, session/history/SSE, Gemini/ADK, capability discovery/execution, HITL/confirmation;
3. **Hệ sinh thái plugin/module độc lập** — chức năng nghiệp vụ được đóng gói thành module có thể đăng ký, bật, tắt, gắn hoặc gỡ mà không làm hỏng Core, Chatbox Agent hoặc module khác.

**Sản phẩm không được định nghĩa là một chatbot biết đọc file.** File/document là một capability/infrastructure và một nhóm module trên nền tảng. Mục tiêu chính là tạo **bộ khung Agent Webapp ổn định có khả năng mở rộng bằng module**.

## 2. North-star architecture

```text
User
  |
  v
+------------------------------------------------------+
|                  AGENT WORKSPACE                     |
|                                                      |
|  +---------------------- CORE ---------------------+ |
|  | App Shell | Auth/Owner | Settings | Registry   | |
|  | Permissions | Persistence | Events | Runtime    | |
|  +------------------------+-------------------------+ |
|                           |                           |
|                  +--------v---------+                 |
|                  | AGENT CHATBOX    |                 |
|                  | Gemini / ADK     |                 |
|                  +--------+---------+                 |
|                           |                           |
|                 Capability Registry                  |
|                           |                           |
|      +----------+---------+---------+----------+      |
|      v          v                   v          v      |
|    Tasks     Biên tập          Tài liệu    Research  |
|                                                ...   |
|                         Văn bản hành chính            |
+------------------------------------------------------+
```

Agent Chatbox không hard-code implementation của từng module. Agent chỉ nhìn thấy capability hợp lệ do các module đang available/enabled đăng ký qua canonical registry/gateway.

## 3. Nguyên tắc bất biến

### 3.1. Core independence

- Core phải boot/run được khi tất cả module nghiệp vụ optional bị disable.
- Core không import implementation cụ thể của module nghiệp vụ theo cách làm module trở thành dependency bắt buộc.
- Lỗi của một module không được làm sập App Shell hoặc Agent runtime.

### 3.2. Module isolation

Mỗi module phải có boundary rõ ràng và có thể đóng góp một hoặc nhiều thành phần:

- UI/navigation/routes/widgets;
- settings;
- permissions;
- persistence/data access qua authority phù hợp;
- Agent capabilities/tools;
- events;
- lifecycle enable/disable.

Module A không được phụ thuộc cứng vào implementation của Module B. Tương tác liên module phải đi qua shared contract, event hoặc capability/gateway được phê duyệt.

### 3.3. Lifecycle contract

Một module optional phải hướng tới các trạng thái:

`registered -> enabled -> disabled -> enabled -> unregistered/removed`

Yêu cầu:

- enable: UI/routes/capabilities tương ứng xuất hiện;
- disable: các contribution tương ứng biến mất hoặc fail closed;
- remove: Core và module khác vẫn compile/build/run nếu module được xác định là optional;
- durable data của module không được tự ý bị xóa chỉ vì disable;
- lifecycle không được tạo authority song song với canonical server state.

### 3.4. Agent integration

- `ServerCapabilityRegistry` là canonical runtime registry.
- `CapabilityExecutionService` là central execution gateway.
- Module disabled/unavailable => Agent không được discover/execute capability của module đó.
- Không hard-code chuỗi `if module X` ngày càng tăng trong RootAgent/Core nếu có thể biểu diễn bằng contract/registry.
- HITL, permission, idempotency, audit và cancellation tiếp tục dùng canonical platform infrastructure.

### 3.5. Platform capability vs module capability

**Platform/shared infrastructure** gồm các năng lực nền như auth, session, confirmation, binary storage, file authorization, eventing, capability execution, provider/runtime integration.

**Module capability** là nghiệp vụ cụ thể như task create/query, editor rewrite, research run, document search, administrative-format validate/apply.

Không biến một module nghiệp vụ thành platform authority nếu không có design gate.

## 4. Các module định hướng

### 4.1. Task

Mục tiêu người dùng:

- tạo/sửa/hoàn thành/xóa task;
- trạng thái, ưu tiên, deadline, lọc/tìm;
- Agent có thể tạo/truy vấn/cập nhật task qua capability;
- về sau có thể mở reminder/scheduling nhưng không làm Core phụ thuộc Task.

Task là module optional. Disable Task phải loại Task UI/capabilities mà Chatbox/Core vẫn hoạt động.

### 4.2. Biên tập

Workspace xử lý nội dung:

- soạn và biên tập;
- viết lại, rút gọn/mở rộng;
- chỉnh giọng văn, cấu trúc, logic;
- so sánh phiên bản;
- nhận nội dung/tài liệu qua contract dùng chung;
- sử dụng Agent/AI infrastructure của Core, không tạo AI runtime thứ hai.

### 4.3. Quản lý tài liệu

Module nghiệp vụ cho tài liệu cá nhân:

- upload/import;
- danh sách/metadata;
- xem/tải/tìm/chọn/tái sử dụng;
- attach vào chat hoặc chuyển cho module khác;
- delete/lifecycle/recovery.

Phân biệt rõ:

- **file/document infrastructure** có thể là shared platform service;
- **Quản lý tài liệu** là module UI/nghiệp vụ sử dụng infrastructure đó.

Gỡ module Quản lý tài liệu không được phá binary/file authority nền tảng nếu authority đó còn được module khác sử dụng theo contract.

### 4.4. Research

Workflow nghiên cứu có cấu trúc:

`đề bài -> kế hoạch -> tìm nguồn -> thu thập -> đọc -> đối chiếu -> trích dẫn -> tổng hợp -> báo cáo`

Có thể sử dụng web/search, tài liệu người dùng, connectors và Gemini qua platform contracts. Research không trở thành dependency bắt buộc của Chatbox/Core.

### 4.5. Định dạng văn bản hành chính

Module chuyên biệt cho **chuẩn hóa thể thức/trình bày văn bản đã có nội dung**, không mặc định là module sáng tác nội dung.

Workflow mục tiêu:

`upload/open document -> parse structure -> detect document components -> validate rule pack -> show findings -> authorized safe autofix -> preview/review -> export`

Rule packs định hướng gồm Nghị định 30/2020/NĐ-CP, hướng dẫn/văn bản Đảng và các quy tắc chuyên ngành/tổ chức được xác định sau. Module có thể dùng Document infrastructure nhưng phải độc lập với module Quản lý tài liệu.

### 4.6. Module tương lai

Có thể bổ sung Notes, Calendar, Email, Drive/connectors, Maritime/domain modules hoặc custom plugins. Việc thêm module mới không được buộc Core phải sửa theo số lượng module.

## 5. Workflow người dùng mục tiêu

### 5.1. Chat-first

`Mở app -> Chatbox -> nêu yêu cầu -> Agent discover capability từ module enabled -> nếu cần HITL thì hỏi xác nhận -> execute -> trả kết quả -> persist đúng semantics.`

### 5.2. Module-first

`Mở module -> thao tác UI nghiệp vụ -> có thể gọi Agent/platform capability -> lưu kết quả theo authority của module/platform.`

### 5.3. Cross-module

Ví dụ:

`Quản lý tài liệu -> chọn báo cáo -> Research bổ sung nguồn -> Biên tập chỉnh nội dung -> Định dạng văn bản hành chính chuẩn hóa -> Task tạo việc hoàn thiện.`

Đây là nhiều module độc lập phối hợp qua contract, không phải một siêu-module phụ thuộc chéo trực tiếp.

## 6. Acceptance contract cho mọi module mới

Một module optional chỉ được coi là kiến trúc đạt yêu cầu khi có evidence cho các điểm phù hợp với scope:

1. register thành công;
2. enable => contributions/capabilities xuất hiện;
3. disable => contributions/capabilities biến mất/fail closed;
4. Core vẫn boot/run khi module disabled;
5. module khác vẫn hoạt động;
6. Agent không discover/execute tool của module disabled;
7. routes/navigation/widgets/settings tuân theo lifecycle;
8. permissions được enforce server-side;
9. không có hard dependency Core -> module implementation ngoài composition/registration boundary được phê duyệt;
10. không có hard dependency module -> module ngoài shared contract/event/capability;
11. remove-code test/build cho module optional phải được thực hiện ở milestone plugin hardening;
12. module failure được cô lập và observable;
13. không tạo runtime, storage authority, history authority hoặc confirmation authority song song.

## 7. Phạm vi triển khai hiện tại

- single-user owner;
- chưa public/multi-user;
- ưu tiên ổn định và workflow thực tế cho người dùng cuối;
- Google AI Studio + Firebase + Gemini/ADK;
- GĐ1-GĐ3 đã khóa nền tảng;
- GĐ4 đang hoàn thiện file/document input và đồng thời phải được dùng để kiểm chứng modular architecture;
- L3A đã FINAL PASS / LOCKED tại canonical production checkpoint trước tài liệu này;
- L3B vẫn là design gate, chưa implementation.

## 8. Quy tắc thay đổi định nghĩa

Tài liệu này là **product intent canonical**. `PROJECT_MASTER_PLAN.md` là progress/implementation tracker. `ARCHITECTURE_FINAL.md` mô tả architecture thực tế của source tại checkpoint tương ứng.

Nếu implementation plan mâu thuẫn với tài liệu này, phải dừng và thực hiện architecture/product-scope review thay vì âm thầm đổi định hướng.

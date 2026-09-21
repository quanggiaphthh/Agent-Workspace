# AGENT-WORKSPACE — MODULAR ARCHITECTURE AUDIT & COMPLETION ROADMAP

> **Audit baseline:** `b979c0c7db2979582db47a794c02c4f52b36fa7c`  
> **Date:** 2026-09-22  
> **Purpose:** đối chiếu source hiện tại với định nghĩa sản phẩm modular và lập kế hoạch hoàn thiện.  
> **Mode:** audit/plan; tài liệu này không tự tuyên bố các finding đã được implementation.

## 1. Executive verdict

Source hiện tại có **nền móng modular thật**, không phải kiến trúc giả lập: client có `ModuleManifest`, local registry, dynamic route/navigation/widget contributions, enable/disable lifecycle; server có module catalog/state và capability discovery đã biết kiểm module state. GĐ1-GĐ3 cũng đã tạo Agent runtime, capability gateway, HITL, session/history và authority boundaries đủ mạnh để làm platform core.

Tuy nhiên, source **chưa chứng minh đầy đủ mục tiêu plugin/module độc lập có thể gắn/gỡ/vô hiệu mà không ảnh hưởng Core/module khác**. Hiện architecture gần với **statically composed modular monolith** hơn là plugin platform hoàn chỉnh. Điều này phù hợp với giai đoạn hiện tại nhưng phải được harden trước khi nhân rộng Task/Biên tập/Tài liệu/Research/Văn bản hành chính.

**Verdict:** `FOUNDATION STRONG — MODULARITY HARDENING REQUIRED BEFORE MODULE SCALE-OUT`.

## 2. Evidence đã audit

### 2.1. Điểm mạnh hiện hữu

1. `src/App.tsx` chỉ bootstrap rồi tạo dynamic router; App shell không import trực tiếp Tasks.
2. `src/core/modules/moduleRegistry.ts` đã có:
   - register/unregister;
   - enable/disable;
   - enabled filtering;
   - navigation/routes/widgets aggregation;
   - permission-aware listing;
   - server state synchronization;
   - lifecycle callbacks/events.
3. `shared/contracts/module.ts` đã định nghĩa manifest/contributions/lifecycle.
4. `server/core/modules/moduleCatalog.ts` đã tách metadata server-side và phân biệt core module không disable với Tasks có thể disable.
5. `ARCHITECTURE_FINAL.md` xác nhận capability discovery/execution refresh durable module state và fail closed khi disableable module state không verify được.
6. GĐ3 đã khóa `ServerCapabilityRegistry`, `CapabilityExecutionService`, `ConfirmationService`, idempotency/audit/cancellation — đây là platform primitives phù hợp cho module capabilities.
7. GĐ4 L1-L3A đã giữ file authority server-side và không thêm Agent file capability tùy tiện.

## 3. Findings / gaps

### F1 — HIGH: Client module composition vẫn hard-coded trong bootstrap

`src/bootstrap.ts` import trực tiếp `homeManifest`, `settingsManifest`, `tasksManifest` rồi register thủ công.

Hệ quả:

- disable runtime đã có, nhưng **remove code module** chưa được chứng minh;
- thêm module mới đòi sửa bootstrap;
- Core composition root biết tên từng domain module;
- chưa có discovery/registration boundary đủ sạch để scale nhiều module.

Đây chưa phải production bug, nhưng là gap chính so với product intent.

### F2 — HIGH: Server module catalog cũng seed domain module tĩnh

`server/core/modules/moduleCatalog.ts` seed `home`, `settings`, `tasks` trong cùng file catalog.

Hệ quả:

- server core catalog biết domain module cụ thể;
- remove Tasks code/registration chưa có acceptance proof;
- module metadata và registration chưa được đóng gói self-contained theo module package/composition layer.

### F3 — HIGH: Chưa có canonical Plugin/Module Isolation Gate

Current CI kiểm functional/security/regression rất mạnh nhưng chưa có acceptance gate bắt buộc cho:

- enable/disable contributions;
- capability disappearance khi disabled;
- Core boot khi domain module disabled;
- module A unaffected khi module B disabled;
- remove-code/build test cho optional module;
- failure isolation.

Không nên nhân rộng 5-10 module trước khi có gate này.

### F4 — MEDIUM/HIGH: Shared module contract mang React runtime/type coupling

`shared/contracts/module.ts` import `React` và chứa `React.ComponentType` trong `RouteContribution`/`DashboardWidgetContribution`.

Nếu file này thực sự được dùng xuyên client/server, contract module hiện trộn **platform metadata** với **frontend implementation type**. Cần audit dependency graph trước khi sửa; có thể tách `ModuleDescriptor` platform-safe khỏi `ClientModuleManifest`.

Không refactor chỉ vì lý thuyết; phải chứng minh import graph và test trước.

### F5 — MEDIUM: Client lifecycle callbacks chưa thể hiện failure containment

`enable()`/`disable()` gọi lifecycle callback nhưng không await/contain failure theo contract hiện tại. Cần xác minh behavior thực tế và quyết định lifecycle API đồng bộ/async rõ ràng.

Mục tiêu: một plugin lifecycle failure phải observable và không để registry/UI ở trạng thái nửa enable/nửa disable.

### F6 — MEDIUM: `unregister()` hiện là in-memory registry operation, chưa phải uninstall contract

Unregister không đồng nghĩa remove package/code/data. Cần định nghĩa rõ:

- disable;
- unregister runtime;
- uninstall/remove code;
- preserve/delete module data;
- migration/versioning.

Với single-user app hiện tại, chưa cần marketplace/dynamic remote plugin loading. Chỉ cần clean static package boundary + deterministic composition.

### F7 — MEDIUM: Files/document work hiện chưa được đóng thành module boundary rõ

GĐ4 đang xây shared file infrastructure + Home upload entry point + chat attachment. Điều này đúng để xây foundation, nhưng về product architecture cần tách rõ:

- shared `FileDomain/FileInfrastructure`;
- `Document Management` module UI/nghiệp vụ;
- Chat attachment adapter/integration;
- module-specific document consumers (Research, Editor, Administrative Formatter).

Không để GĐ4 vô tình biến Home/Agent Core thành Document module.

### F8 — MEDIUM: Tasks hiện vừa là domain module vừa có system capabilities

`ARCHITECTURE_FINAL.md` mô tả Tasks/Memory/Search capabilities cùng đăng ký trong `systemCapabilities.ts`. Cần audit source để phân loại:

- capability nào là platform/system;
- capability nào thuộc Tasks module;
- capability nào phải biến mất khi Tasks disabled.

Mục tiêu dài hạn: domain capability ownership nằm ở module hoặc module registration layer, không gom tất cả domain tool vào một file system-level khó tháo.

### F9 — LOW/MEDIUM: Product definition và progress tracker trước đây thiên về Files

`PROJECT_MASTER_PLAN.md` hiện mô tả GĐ4 tốt nhưng chưa thể hiện đầy đủ north-star modular platform và danh mục module định hướng. Tài liệu product definition mới phải trở thành scope guard; Master Plan cần được chỉnh ở một documentation housekeeping lượt riêng sau audit approval.

### F10 — LOW: Repository visibility hiện là public

Repo metadata tại audit cho thấy visibility public. Đây là operational observation, không phải coding blocker. Vì app định hướng cá nhân/chưa public, cần bảo đảm không có secret/credential committed và quyết định visibility theo nhu cầu của chủ repo.

## 4. Target architecture cần đạt

### 4.1. Platform/Core

Core chỉ sở hữu:

- App shell/router host;
- identity/owner/auth;
- settings platform;
- module registry/composition/lifecycle contracts;
- permission framework;
- event bus;
- Agent runtime/session/history/SSE;
- capability registry/execution/HITL/audit/idempotency;
- shared storage/file infrastructure nếu được design là platform service;
- observability/error/cancellation.

### 4.2. Module package boundary

Mỗi domain module nên có cấu trúc tương đương (tên cụ thể được quyết định sau discovery):

```text
modules/<module>/
  client/
  server/
  shared/
  manifest/registration
  tests/
```

Không bắt buộc refactor ngay theo đúng thư mục này; yêu cầu là **boundary semantics**, không phải cosmetic folder move.

### 4.3. Composition

Cho deployment single-user hiện tại, chọn **build-time/static module composition** trước, không cần marketplace/dynamic remote code loading.

Một composition layer được phép biết danh sách module được đóng gói; Core runtime không được chứa domain behavior. Việc thêm/gỡ module nên chủ yếu thay composition/module package, không sửa RootAgent, registry internals, App shell hoặc module khác.

## 5. Kế hoạch hoàn thiện — thứ tự đề xuất

### PHASE A — Governance & Modularity Definition

**A1. Product definition — COMPLETE by this documentation checkpoint.**

**A2. Master Plan reconciliation.**

- thêm north-star modular architecture;
- thêm module roadmap;
- phục hồi/chuẩn hóa progress dashboard nếu cần;
- không làm mất lịch sử GĐ1-GĐ4;
- không đổi trạng thái LOCKED.

**A3. Module taxonomy.**

Chốt ba lớp:

1. Core/platform;
2. shared infrastructure/adapters;
3. domain modules.

Output: dependency rules + allowed imports.

### PHASE B — MODULARITY HARDENING GATE (thực hiện trước scale-out module)

Đây nên là milestone mới, nhưng không cần chen ngang phá L3B design investigation. Có thể thực hiện **sau L3B design gate và trước khi mở rộng L3C/L4 thành UI module lớn**, tùy kết quả audit ADK.

**B1. Full dependency/coupling audit**

Audit:

- `src/bootstrap.ts`;
- router creation;
- navigation/sidebar/dashboard;
- module settings UI/API;
- server module catalog/storage;
- capability bootstrap/systemCapabilities;
- RootAgent capability discovery;
- Tasks imports;
- Home upload/file imports;
- shared contracts.

Deliverable: dependency map + exact refactor plan. Không implementation trước audit.

**B2. Canonical module descriptor split**

Nếu audit xác nhận cần thiết:

- platform-safe module descriptor;
- client contributions riêng;
- server registration riêng;
- version/lifecycle metadata;
- capability ownership.

**B3. Composition root**

Tạo một client composition boundary và một server composition boundary. Core registries nhận registrations; domain modules không seed trực tiếp trong registry implementation.

**B4. Lifecycle semantics**

Định nghĩa và test:

- enable/disable atomic semantics;
- async lifecycle failure handling;
- server durable state authority;
- fail-closed capability behavior;
- data preservation semantics.

**B5. Isolation tests**

Bắt buộc:

- Tasks enabled/disabled;
- navigation/routes/widgets;
- capability discovery/execution;
- Core boot with Tasks disabled;
- module-independent tests;
- compile/build without optional module registration;
- preferably physical remove-code fixture/build proof cho một sample optional module.

**B6. CI gate**

Thêm `Module Isolation / Plugin Lifecycle` vào canonical verification.

### PHASE C — Finish GĐ4 document/file platform correctly

Không bỏ công việc đã làm.

**C1. L3B Design Gate — NEXT IMMEDIATE TECHNICAL ACTION**

- inspect exact installed `@google/adk` 2.1.0 source/types;
- tìm supported invocation-local enrichment seam;
- chứng minh media/text materialization không persist binary Parts;
- no Runner bypass/history hack;
- architecture escalation nếu không có seam sạch.

**C2. L3B implementation** chỉ sau checker approval.

**C3. L3C composer attachment UX** nhưng phải tuân module/core boundary mới; không hard-wire Document module vào Agent Core.

**C4. L3D real Gemini/Firebase E2E.**

**C5. Document Management module**

Chuyển từ Home upload entry point sang module nghiệp vụ hoàn chỉnh theo module contract:

- list/search/filter;
- metadata;
- upload/reuse/download/open;
- attach/select;
- lifecycle/delete/recovery;
- isolation tests.

Shared FileDomain vẫn là platform/shared infrastructure nếu audit xác nhận nhiều module cần dùng.

### PHASE D — Task module normalization

Task đã tồn tại nên dùng làm **reference optional module** để chứng minh plugin lifecycle.

- move/own Task capabilities đúng boundary;
- remove hard-coded registration khỏi registry implementation;
- verify disable => no Task UI/tool;
- Core/other modules unaffected;
- preserve existing functionality and locked GĐ3 invariants.

Không rewrite Task nếu chỉ cần composition/ownership corrective.

### PHASE E — Biên tập module

MVP:

- editor workspace;
- input/paste/open content;
- rewrite/shorten/expand/style/structure operations;
- version/diff/review baseline;
- use Core Agent/AI gateway;
- consume document references through shared contract;
- no independent AI runtime.

Acceptance: disable/remove module không ảnh hưởng Chat/Task/Documents.

### PHASE F — Research module

MVP:

- research brief;
- research plan;
- web/source acquisition;
- source list/citations;
- synthesis/report;
- consume uploaded documents through shared document contract;
- cancellation and provenance.

Không biến Research thành generic autonomous background agent trước khi MVP ổn định.

### PHASE G — Administrative Document Formatting module

MVP tách rõ **formatting/validation** khỏi content generation:

1. document ingest/open;
2. structure/materialization model;
3. rule engine/rule packs;
4. deterministic findings;
5. safe/authorized autofix;
6. preview/review;
7. export DOCX;
8. provenance/change report.

Rule packs/versioning phải tách khỏi Core. Nghị định 30 là rule pack đầu tiên; các rule pack khác cắm thêm sau.

### PHASE H — Cross-module orchestration

Chỉ sau khi từng module độc lập PASS:

- Document -> Research;
- Research -> Editor;
- Editor -> Administrative Formatter;
- Agent orchestrates via capability contracts;
- Task receives explicit work items.

Không tạo direct module imports để nối workflow.

### PHASE I — Production hardening / UAT

Tương ứng GĐ5-GĐ6 nhưng mở rộng acceptance theo modular platform:

- startup/degraded module behavior;
- error isolation;
- migrations/version compatibility;
- observability;
- security/dependency review;
- Firebase/Gemini real runtime;
- single-user UAT;
- backup/recovery;
- deployment readiness.

## 6. Priority matrix

| Priority | Work | Reason |
|---|---|---|
| P0 | L3B design gate | Current canonical next action; quyết định document input seam |
| P0 | Modularity dependency audit | Ngăn Files/Tasks trở thành coupling mẫu cho module sau |
| P0 | Module isolation acceptance contract | Product north-star bắt buộc |
| P1 | Composition root + lifecycle hardening | Cho phép scale module an toàn |
| P1 | Finish document/file platform + Document module | Shared foundation cho Editor/Research/Formatter |
| P1 | Normalize Task as reference optional module | Chứng minh disable/remove architecture |
| P2 | Editor module | User-facing productivity |
| P2 | Research module | Structured research workflow |
| P2 | Administrative Formatting module | Specialized high-value workflow |
| P3 | Cross-module orchestration | Chỉ sau isolation |
| P3 | Additional plugins/connectors | Sau platform maturity |

## 7. Gate cho từng implementation lượt từ đây

Mỗi lượt phải xác định rõ:

- source of truth/canonical baseline;
- production scope;
- module ownership;
- Core/shared/module dependency impact;
- TDD RED -> GREEN khi implementation;
- targeted tests;
- locked regressions;
- module isolation tests nếu chạm module lifecycle;
- TypeScript;
- full Vitest;
- QA;
- build;
- manifest;
- canonical GitHub runtime verification;
- checker verdict trước LOCK.

## 8. Không làm ở giai đoạn này

- không marketplace/plugin store;
- không remote arbitrary code loading;
- không multi-user collaboration;
- không generic RAG/vector platform nếu chưa có use case/gate;
- không microservices hóa chỉ để gọi là plugin;
- không rewrite GĐ1-GĐ3 đã LOCKED;
- không thêm module hàng loạt trước Modularity Hardening Gate.

## 9. Immediate next actions

1. Giữ `b979c0c7...` làm production baseline trước documentation commit này.
2. Lưu `PROJECT_DEFINITION.md` và audit/roadmap này làm governance docs.
3. Không implementation trong documentation checkpoint.
4. Bắt đầu **L3B DESIGN GATE** theo Master Plan, đồng thời yêu cầu output của design gate đánh giá impact lên modular boundary.
5. Sau L3B design decision, thực hiện **Modularity Dependency Audit** trước khi scale UI/module work.
6. Chỉ sau checker approval mới cập nhật `PROJECT_MASTER_PLAN.md` để tích hợp roadmap modular mới vào tracker canonical.

## 10. Audit conclusion

Dự án hiện **không cần làm lại từ đầu**. GĐ1-GĐ3 và GĐ4 L1-L3A là nền móng có giá trị và tương thích với hướng modular. Việc cần làm là chuyển từ “có registry và module state” sang “module boundary được chứng minh bằng isolation/remove tests và composition architecture”.

Mục tiêu kỹ thuật kế tiếp không phải tăng số tính năng nhanh nhất, mà là bảo đảm **module thứ 5, thứ 10 có thể được thêm mà Core không bị xói mòn kiến trúc**.

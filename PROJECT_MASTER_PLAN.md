# AGENT-WORKSPACE — PROJECT MASTER PLAN & PROGRESS TRACKER

> **Vai trò:** tài liệu canonical để theo dõi kế hoạch, trạng thái, checkpoint, acceptance gate và tiến độ triển khai Agent-Workspace.
>
> **Cập nhật:** 2026-09-22
>
> **Mô hình triển khai mục tiêu:** single-user owner, chưa public; Google AI Studio + Firebase + Gemini API; ưu tiên ứng dụng ổn định và người dùng cuối sử dụng được.

---

## 1. Quy tắc quản trị kế hoạch

1. Mỗi giai đoạn/lượt chỉ được chuyển sang **FINAL PASS / LOCKED** sau khi checker xác minh source và các gate bắt buộc.
2. Không mở lại phần đã LOCKED trừ khi có regression/blocker tái hiện được.
3. Mỗi lượt lớn đi theo chu trình: **audit/design → implementation TDD → checker source audit → canonical GitHub runtime verification → LOCK**.
4. ChatGPT Web thực hiện các lượt phát triển lớn và đóng gói checkpoint; chỉnh sửa nhỏ/corrective có thể giao AI Studio trực tiếp.
5. Chỉ đưa checkpoint lên AI Studio khi hoàn thành một lượt/giai đoạn đủ lớn hoặc khi cần canonical GitHub verification.
6. AI Studio là nơi đồng bộ/commit khi phù hợp; **không dùng SHA-256 của ZIP AI Studio để so với checkpoint ZIP gốc**. Sau khi qua AI Studio, xác minh bằng source thực tế, manifest, diff, tests và GitHub Actions.
7. Không commit/push/deploy từ lượt implementation nếu prompt chưa cho phép.
8. Không suy diễn PASS. Gate chưa chạy hoặc FAIL thì trạng thái không được ghi FINAL PASS.
9. `PRODUCTION_SOURCE_MANIFEST.sha256` là integrity gate của production source và phải được cập nhật/xác minh khi production source thay đổi.
10. Không dùng `npm audit fix --force` trong một lượt tính năng. Dependency/security housekeeping phải tách riêng và kiểm chứng regression.

### Trạng thái chuẩn

- `PLANNED` — đã xác định scope, chưa bắt đầu.
- `IN PROGRESS` — đang triển khai/kiểm thử.
- `SOURCE AUDIT PASS` — checkpoint đã qua checker source audit, chưa có canonical runtime verification.
- `BLOCKED` — có blocker; phải ghi rõ loại và bằng chứng.
- `FIX REQUIRED` — có defect tái hiện được cần corrective.
- `FINAL PASS / LOCKED` — hoàn tất, đã qua canonical verification.
- `DEFERRED` — cố ý chưa thực hiện, không phải defect của scope hiện tại.

---

## 2. Canonical project status

| Giai đoạn | Mục tiêu | Trạng thái | Canonical checkpoint/baseline |
|---|---|---|---|
| GĐ1 | Single-user owner foundation, settings/model/credential baseline | **FINAL PASS / LOCKED** | Đã khóa |
| GĐ2 | Agent execution/chat runtime, SSE, cancellation, session/history, temporary chat/recovery | **FINAL PASS / LOCKED** | Đã khóa |
| GĐ3 | Capability execution architecture, idempotency, ADK tools, HITL/resume, integration | **FINAL PASS / LOCKED** | Đã khóa |
| GĐ4 | Persistent personal files + secure file use by end user/Agent | **IN PROGRESS** | `2f45b997db25fd61736b239f71f6d3767aa4a508` — Lượt 2 FINAL PASS / LOCKED |
| GĐ5 | Production/runtime hardening cho single-user deployment | **PLANNED** | Chỉ mở sau GĐ4 Final Gate |
| GĐ6 | Final end-user acceptance + release/deployment readiness | **PLANNED** | Chỉ mở sau GĐ5 |

---

# 3. GĐ1 — SINGLE-USER OWNER FOUNDATION

**Trạng thái: FINAL PASS / LOCKED**

Mục tiêu đã khóa:

- owner/single-user permission model;
- settings persistence;
- Google provider/model baseline;
- credential policy;
- không mở multi-user/public scope.

**Quy tắc:** không refactor GĐ1 trong các giai đoạn sau nếu không có blocker thực tế.

---

# 4. GĐ2 — AGENT CHAT & EXECUTION RUNTIME

**Trạng thái: FINAL PASS / LOCKED**

Các invariant đã khóa:

- `AgentChatThread → AdkRuntimeProvider → /api/agent/chat → RootAgent → Gemini → SSE`;
- strict request contract và SSE lifecycle;
- cancellation/timeout, abort propagation, stale-run isolation;
- server-persisted ADK session/history; localStorage chỉ giữ pointer;
- temporary chat không persist sai semantics;
- recovery và reload behavior được giữ ổn định.

Không tạo runtime/chat authority thứ hai trong giai đoạn sau.

---

# 5. GĐ3 — CAPABILITY EXECUTION + HITL

**Trạng thái: FINAL PASS / LOCKED**

Các invariant canonical:

- `ServerCapabilityRegistry` = canonical runtime registry;
- `CapabilityExecutionService` = central execution gateway;
- Zod = canonical runtime validation;
- `ConfirmationService` = canonical confirmation authority;
- side-effect / risk / confirmation policy có semantics rõ ràng;
- durable mutation idempotency/recovery;
- native ADK FunctionTool bridge;
- HITL confirmation/resume/reload không tạo workflow authority song song;
- canonical capability set không được mở rộng ngoài kế hoạch mà không qua design gate.

---

# 6. GĐ4 — PERSISTENT PERSONAL FILES + DOCUMENT INPUT

## 6.1. Mục tiêu GĐ4

Cho phép một người dùng thực sự:

1. upload file an toàn;
2. quản lý file cá nhân bền vững;
3. đính kèm file vào chat;
4. để Gemini/Agent hiểu file được người dùng cấp quyền trong đúng lượt/ngữ cảnh;
5. đọc/tái sử dụng file theo quyền và lifecycle rõ ràng;
6. xóa/khôi phục/xử lý lỗi an toàn;
7. hoàn tất end-to-end runtime verification.

**Không biến GĐ4 thành:** project/workspace platform, virtual filesystem, generic cloud drive, artifact platform, vector database/RAG platform hoặc multi-user collaboration.

---

## 6.2. GĐ4 Lượt 1 — Secure File Domain + Storage Foundation

**Trạng thái: FINAL PASS / LOCKED**

Đã hoàn thành:

- Firebase Storage chứa binary;
- Firestore `user_files` chứa canonical metadata;
- `UserFileService` là canonical file/storage-record authority;
- ownership server-derived;
- UUID/object-path isolation;
- MIME/signature validation foundation;
- application upload limit 20 MiB;
- compensation khi metadata persistence thất bại;
- owner-authorized resolve;
- `files.read` / `files.write` trong canonical permission catalog;
- không thêm Agent file capability ở Lượt 1.

Canonical verification đã đạt 29/29 test files, 271/271 tests tại thời điểm khóa Lượt 1.

---

## 6.3. GĐ4 Lượt 2 — End-user File Upload Pipeline

**Trạng thái: FINAL PASS / LOCKED**

Canonical HEAD:

`2f45b997db25fd61736b239f71f6d3767aa4a508`

Canonical GitHub Actions verification:

`35644917109`

Lượt 2 đã hoàn thành toàn bộ pipeline upload cho người dùng cuối qua hai phần 2A + 2B, trên cùng canonical file authority của Lượt 1.

### Lượt 2A — Secure File Ingestion + Validation Pipeline

**Trạng thái: FINAL PASS / LOCKED**

Đã hoàn thành:

- `FileIngestionService` là canonical ingestion/validation gateway trước `UserFileService`;
- `/api/files` là bounded server upload transport boundary;
- actual + declared size validation;
- filename normalization/display policy;
- extension + MIME + lightweight signature validation;
- owner/spoof protection và server-derived authoritative metadata;
- compensation semantics của Lượt 1 được giữ nguyên;
- không có direct Firebase Storage write từ browser.

### Lượt 2B — End-user Upload Integration + Runtime UX Completion

**Trạng thái: FINAL PASS / LOCKED**

Đã hoàn thành:

- `HomeModule` có entry point upload tối thiểu cho người dùng cuối;
- frontend upload đi duy nhất qua canonical `/api/files` bằng authenticated request convention hiện hữu;
- public upload policy dùng chung cho supported types và application limit 20 MiB mà không đưa server/storage internals vào browser;
- client pre-check chỉ phục vụ UX; server vẫn là security authority;
- trạng thái select/upload/success/error/retry rõ ràng;
- duplicate submit bị chặn khi request đang pending;
- abort/stale-response safety ngăn request cũ ghi đè lựa chọn mới;
- success UI chỉ dùng canonical public file metadata/opaque file ID, không render storage object/path;
- machine-readable server errors được map sang thông báo an toàn;
- không mở chat attachment, Gemini document input, file library hoặc direct browser Storage authority.

### Canonical verification evidence

Tại HEAD `2f45b997db25fd61736b239f71f6d3767aa4a508`, GitHub Actions run `35644917109` đã xác minh:

- `npm ci`: PASS;
- production manifest đầu vào: **138/138 PASS**;
- TypeScript: PASS;
- GĐ4 Lượt 1: **27/27 PASS**;
- Capability Tool Bridge: **18/18 PASS**;
- GĐ4 Lượt 2A gateway: **16/16 PASS**;
- GĐ4 Lượt 2B client: **9/9 PASS**;
- Full Vitest: **31/31 files, 299/299 tests PASS**;
- Acceptance: **13/13 PASS**;
- QA Stage 1–5: ALL PASS;
- production build: PASS;
- final production manifest: **138/138 PASS**.

**Completion gate:** GĐ4 Lượt 2 đã đạt **FINAL PASS / LOCKED**. Phần tiếp theo duy nhất của roadmap là GĐ4 Lượt 3; không mở lại Lượt 2 nếu không có regression/blocker tái hiện được.

---

## 6.4. GĐ4 Lượt 3 — Chat Attachment + Gemini Document Input

**Trạng thái: PLANNED — NEXT**

Mục tiêu cấp roadmap:

Cho phép file mà người dùng đã upload qua canonical file pipeline được sử dụng thực sự trong hội thoại/Agent execution theo cách có kiểm soát.

Nguyên tắc kiến trúc bắt buộc cho discovery/implementation sau này:

1. File upload pipeline hiện hữu là canonical ingress; không tạo upload pipeline thứ hai riêng cho chat.
2. Chat attachment phải reuse canonical file identity, metadata và ownership.
3. Browser/client không phải authority cho storage object identity, MIME trust, file authorization hoặc Gemini document authority.
4. Server tiếp tục là trust boundary và phải authorize/resolve attachment từ canonical file authority.
5. Gemini document input phải được xây trên canonical server-side file authority.
6. Không bypass auth, file policy, ownership hoặc existing Agent execution architecture.
7. Không tạo parallel Agent runtime hoặc parallel file authority.
8. Phải giữ compatibility với persistent chat, temporary chat, cancellation, timeout, stale-run isolation, session/history reconciliation, HITL/tool resume và idempotency đã khóa.
9. File content luôn là untrusted user data; nội dung file không được tự cấp quyền, thay policy hoặc trở thành security authority.
10. Discovery Lượt 3 phải đọc source/SDK/runtime thực tế trước khi quyết định Gemini transport/materialization strategy; không mặc định trước inline bytes, Gemini Files API URI, GCS URI hoặc transport cụ thể khác.

Lượt 3 là một lượt riêng. Tài liệu checkpoint này không implementation chat attachment hoặc Gemini document input.

---

## 6.5. GĐ4 Lượt 4 — File Library + Authorized File Operations

**Trạng thái: PLANNED**

Chỉ thiết kế sau khi Lượt 3 đã LOCK để tránh tạo tool contract trước khi model-input semantics ổn định.

Mục tiêu:

- giao diện file library cá nhân tối thiểu, dùng được;
- list/get metadata/download/open theo quyền;
- chọn file đã lưu để attach lại vào chat;
- canonical read semantics;
- nếu Master Plan sau audit xác nhận cần Agent file tool: thêm tool/capability qua GĐ3 canonical registry/execution/confirmation architecture, không bypass;
- pagination/bounds phù hợp;
- không generic filesystem;
- không arbitrary path access;
- không semantic search/RAG trong lượt này.

Acceptance: người dùng quản lý và tái sử dụng file cá nhân; mọi read/list/attach đều owner-authorized; capability/tool nếu có đi qua canonical GĐ3 execution path.

---

## 6.6. GĐ4 Lượt 5 — File Lifecycle Security, Delete, Recovery & Orphan Control

**Trạng thái: PLANNED**

Mục tiêu:

- canonical delete lifecycle;
- metadata/blob consistency;
- idempotent delete/retry;
- partial failure recovery;
- orphan detection/cleanup strategy;
- deleted/unavailable file fail-closed;
- safe behavior khi chat/history còn reference tới file đã xóa;
- authorization regression;
- audit/error observability cần thiết cho single-user runtime;
- không expose internal storage identity.

Phải xác định rõ hard-delete/soft-delete semantics từ architecture hiện hữu trước implementation; không tự thêm recycle-bin feature nếu chưa cần.

---

## 6.7. GĐ4 Lượt 6 — Final Integration + End-to-End Runtime Verification

**Trạng thái: PLANNED**

Đây trước hết là **VERIFY FIRST → FIX ONLY REPRODUCIBLE BLOCKERS → RE-VERIFY**.

E2E tối thiểu:

1. user upload file từ UI;
2. server ingest/validate/store;
3. canonical metadata tồn tại đúng owner;
4. user attach file vào chat;
5. server authorize/resolve;
6. Gemini/Agent sử dụng file đúng turn;
7. history/reload semantics đúng;
8. file library/reuse đúng;
9. delete/lifecycle đúng;
10. foreign/spoof/malformed/oversized cases fail closed;
11. cancellation/retry không tạo stale/duplicate state.

Final gates:

- clean dependency install;
- production manifest;
- TypeScript;
- toàn bộ GĐ4 targeted suites;
- GĐ1–GĐ3 regression suites;
- full Vitest 0 fail / 0 unhandled;
- canonical QA Stage 1–5;
- production build;
- final manifest;
- runtime probe trong môi trường Firebase/Gemini hợp lệ nếu cần;
- security architecture audit.

Chỉ sau gate này mới ghi **GĐ4 FINAL PASS / LOCKED**.

---

# 7. GĐ5 — SINGLE-USER PRODUCTION/RUNTIME HARDENING

**Trạng thái: PLANNED — không mở trước khi GĐ4 LOCKED**

Mục tiêu: xử lý các vấn đề vận hành còn lại trước release ổn định, không phát triển feature lớn.

Các workstream phải được audit lại tại thời điểm mở GĐ5:

1. dependency/security audit có kiểm soát;
2. xử lý các vulnerability thực sự ảnh hưởng runtime, không dùng force upgrade mù quáng;
3. Firebase IAM/Rules/Storage Rules verification trên môi trường phù hợp;
4. secret/configuration separation giữa client/server;
5. error handling/logging/observability tối thiểu;
6. request/body/rate/resource bounds phù hợp single-user deployment;
7. backup/recovery/configuration documentation cần thiết;
8. production deployment configuration trên Firebase/Google AI Studio;
9. smoke test sau deploy;
10. regression toàn bộ GĐ1–GĐ4.

### Backlog đã biết cần đánh giá tại GĐ5

Tại các GitHub verification GĐ4 đã quan sát `npm ci` báo **7 dependency vulnerabilities (5 moderate, 2 high)**. Đây là backlog cần audit riêng; chưa được coi là source defect của GĐ4 và không được tự động `npm audit fix --force`.

Production build cũng đã quan sát bundle JavaScript khoảng **1.216 MB trước gzip**. Đây là non-blocking performance observation, không phải blocker của GĐ4 Lượt 2; chỉ tối ưu sau audit ở workstream hardening phù hợp.

GĐ5 phải tạo threat/risk assessment trước khi sửa dependency.

---

# 8. GĐ6 — FINAL USER ACCEPTANCE + RELEASE READINESS

**Trạng thái: PLANNED**

Mục tiêu: chứng minh ứng dụng single-user hoàn chỉnh, ổn định và sẵn sàng sử dụng thực tế.

Acceptance scenarios tối thiểu:

- login/owner session;
- settings/model/credential;
- persistent chat;
- temporary chat;
- cancellation/timeout/recovery;
- capability execution;
- confirmation/HITL/resume;
- mutation idempotency;
- file upload;
- file attach/document understanding;
- file library/reuse;
- file lifecycle/delete;
- reload/restart recovery;
- representative failure paths;
- production smoke test.

Final release gates:

- source/manifest integrity;
- full TypeScript/tests/QA/build;
- runtime configuration verified;
- no open BLOCKER/HIGH source defect;
- known limitations documented;
- deployment/runbook current;
- final canonical commit recorded;
- final checker verdict: **RELEASE READY** hoặc **FIX REQUIRED**.

---

# 9. Deferred / Out of Current Scope

Các mục sau không được tự động đưa vào implementation chỉ vì có liên quan:

- multi-user/public SaaS;
- organizations/teams;
- project/workspace entity;
- virtual filesystem;
- generic cloud-drive behavior;
- arbitrary external URL ingestion;
- DOCX/XLSX/PPTX processing nếu chưa có design riêng;
- OCR service riêng nếu chưa chứng minh cần;
- embeddings/vector DB/RAG;
- semantic file search;
- public sharing;
- autonomous broad file browsing;
- mobile-native application;
- enterprise administration.

Mỗi mục chỉ được mở bằng discovery/design riêng sau khi core single-user application ổn định.

---

# 10. Canonical verification matrix

Mỗi lượt feature phải lựa chọn gate theo phạm vi, nhưng trước khi LOCK một giai đoạn lớn phải có đầy đủ:

| Gate | Yêu cầu |
|---|---|
| Source integrity | baseline đúng, diff đúng scope |
| Manifest | 100% matched, 0 missing/mismatch |
| TypeScript | PASS |
| Targeted tests | PASS, exact counts được ghi |
| Prior-stage regression | PASS |
| Full Vitest | 0 fail, 0 unhandled |
| Canonical QA | Stage 1–5 PASS |
| Production build | PASS |
| Security audit | PASS hoặc limitation được phân loại |
| Runtime verification | GitHub Actions/canonical environment PASS |
| Final manifest | 100% matched |

Không dùng local-only PASS để thay canonical runtime verification khi lượt đó thay production behavior.

---

# 11. Progress dashboard

| ID | Work item | Status | Dependency | Canonical evidence |
|---|---|---|---|---|
| GĐ1 | Single-user owner foundation | 🔒 LOCKED | — | Final reports/checkpoints |
| GĐ2 | Agent chat/execution runtime | 🔒 LOCKED | GĐ1 | Canonical verification |
| GĐ3 | Capability execution + HITL | 🔒 LOCKED | GĐ2 | Canonical verification |
| GĐ4-L1 | File domain/storage foundation | 🔒 LOCKED | GĐ3 | GitHub verification |
| GĐ4-L2A | Secure ingestion/validation | 🔒 LOCKED | L1 | Canonical Lượt 2 verification |
| GĐ4-L2B | End-user upload integration/UX | 🔒 LOCKED | L2A | `2f45b997...`, run `35644917109`, 299/299 |
| **GĐ4-L3** | **Chat attachment + Gemini document input** | **⬜ NEXT** | L2 complete | — |
| GĐ4-L4 | File library + authorized file operations | ⬜ PLANNED | L3 | — |
| GĐ4-L5 | Delete/recovery/orphan/security lifecycle | ⬜ PLANNED | L4 | — |
| GĐ4-L6 | Final GĐ4 E2E integration verification | ⬜ PLANNED | L5 | — |
| GĐ5 | Production/runtime hardening | ⬜ PLANNED | GĐ4 LOCKED | — |
| GĐ6 | Final UAT + release readiness | ⬜ PLANNED | GĐ5 | — |

**Current next action:** GĐ4 Lượt 3 — CHAT ATTACHMENT + GEMINI DOCUMENT INPUT.

---

# 12. Cách cập nhật tài liệu sau mỗi lượt

Sau mỗi checker verdict, cập nhật tối thiểu:

1. `Status` của work item;
2. canonical commit SHA;
3. exact targeted/full test counts;
4. manifest count;
5. GitHub Actions run/result;
6. blocker/known limitation mới;
7. `Current next action`;
8. nếu scope thay đổi: ghi lý do và checker decision, không âm thầm sửa roadmap.

Tài liệu này là **living canonical roadmap**, nhưng các mục đã `FINAL PASS / LOCKED` không được đổi lịch sử tùy tiện.

# GĐ4 L3C — Composer Attachments — Bounded Local Integration

## Verdict

**READY FOR CHECKER REVIEW**

Không tuyên bố FINAL PASS/LOCKED. Không bắt đầu L3D.

## Source audit

Fresh source được lấy từ `agent-webapp (35).zip`.

- `src/agent/ui/AgentChatThread.tsx`: composer hiện hữu là local React textarea/state; trước L3C chưa có attachment UX.
- `src/agent/ui/AdkRuntimeProvider.tsx`: `sendMessage(text)` là đường gửi message hiện hữu tới `/api/agent/chat`; giữ nguyên AgentRuntimeContext, SSE, session/history, HITL, cancellation và temporary-chat architecture.
- `src/modules/home/fileUploadClient.ts`: đã có `uploadUserFile(File, AbortSignal?)`, precheck MIME/size và POST binary trực tiếp tới `/api/files`; được reuse nguyên trạng.
- Canonical L3A contract: `server/agent/chat/chatRequestContract.ts` định nghĩa `AttachmentReference = { fileId: string }`; client L3C import type trực tiếp, không tạo attachment request contract song song.
- Canonical max policy: `server/agent/chat/attachmentPolicy.ts` định nghĩa `MAX_ATTACHMENTS_PER_TURN = 4`; composer reuse trực tiếp constant này.
- Existing L3A tests vẫn là server-side contract authority; không sửa.

## Reuse decision

Flow sau được giữ đúng boundary:

`Browser File -> uploadUserFile -> /api/files -> canonical fileId -> local composer attachment -> sendMessage -> {attachments:[{fileId}]} -> existing L3A/L3B path`.

Reuse trực tiếp:

- `uploadUserFile` và upload error mapping;
- `/api/files`;
- canonical `AttachmentReference`;
- canonical `MAX_ATTACHMENTS_PER_TURN`;
- existing `sendPayloadToAgent` transport;
- existing AgentRuntimeContext/runtime lifecycle.

Không migrate sang assistant-ui runtime. Không tạo upload subsystem, file authority hoặc binary/base64 transport mới.

## New-code necessity

Code mới chỉ sở hữu presentation/local composer lifecycle chưa tồn tại:

- local attachment state: uploading / complete / error;
- file picker và Vietnamese status/error UI;
- remove + abort in-flight upload;
- mapping **chỉ complete canonical fileId** sang `AttachmentReference[]`;
- minimal extension `sendMessage(text, attachments?)`;
- pure request builder để bảo toàn text-only shape khi không có attachment.

Không persist `File`, binary hoặc base64. `File` chỉ sống trong composer state trong phiên render hiện tại.

## Files changed

Production:

1. `src/agent/ui/AgentChatThread.tsx`
2. `src/agent/ui/AdkRuntimeProvider.tsx`

Targeted test added:

3. `src/agent/ui/__tests__/composerAttachments.test.ts`

Manifest:

4. `PRODUCTION_SOURCE_MANIFEST.sha256`

Report:

5. `GD4_L3C_COMPOSER_ATTACHMENTS.md`

Production change surface: 2 files; khoảng 193 added/changed source lines, dưới split threshold.

## Behavior implemented

- chọn nhiều file qua native browser file input;
- reuse canonical accept policy từ `shared/contracts/fileUploadPolicy.ts`;
- upload ngay qua existing `uploadUserFile`;
- trạng thái `Đang tải lên…`, `Đã tải lên`, hoặc lỗi tiếng Việt;
- remove attachment trước send; pending upload bị abort khi remove/unmount;
- canonical maximum 4 attachments;
- pending attachment chặn send và hiển thị hướng dẫn chờ;
- failed attachment không tạo attachment reference;
- successful attachment chỉ gửi `{ fileId }`;
- không gửi owner/storage path/Firebase authority/data URL/base64;
- sau `sendMessage` hoàn tất, text + composer attachments reset;
- text-only `sendMessage` giữ request shape cũ: không thêm field `attachments` rỗng.

## Targeted tests / verification

Targeted test file được viết cho:

- complete upload state -> canonical `{fileId}` reference;
- pending/error excluded;
- remove;
- canonical max 4;
- reset;
- text-only request shape unchanged;
- attachment request contains only canonical fileId and no client authority/base64 fields.

### Execution status

Không thể chạy Vitest/TypeScript/build trong container hiện tại vì dependency tree chưa được cài và `npm ci` bị network timeout. `npm ci --offline` cũng dừng vì package `zwitch-2.0.4.tgz` không có trong cache. Không báo PASS giả.

Đã chạy được:

- `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256` -> **PASS**;
- static forbidden-field scan trên L3C changed source -> không có browser base64/data URL/owner/storage authority transport mới. Chuỗi `data:` còn thấy trong `AdkRuntimeProvider.tsx` là parser SSE `data:` đã tồn tại từ baseline, không phải attachment transport.

Không chạy full Vitest hoặc locked regressions, đúng test-minimization scope.

## Checker / environment verification còn lại

Checker cần chạy trên dependency-clean environment:

1. `npm ci --no-audit --no-fund`
2. `npx vitest run src/modules/home/__tests__/fileUploadClient.test.ts src/agent/ui/__tests__/composerAttachments.test.ts server/agent/chat/__tests__/attachmentBehavior.test.ts`
3. `npm run lint`
4. `npm run build`
5. `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256`

Browser/live verification còn lại: chọn file thật, quan sát pending/complete/error/remove, gửi message có attachment tới existing L3B path và xác nhận composer reset. Đây là L3C browser verification; không mở rộng thành L3D/Firebase full E2E.

## Remaining risks

- Compile/bundle và targeted Vitest chưa được thực thi tại môi trường tạo candidate do dependency install bị network block.
- Browser interaction chưa được chạy tại môi trường tạo candidate.
- Không có thay đổi capability registry; business capability count boundary không bị tác động.

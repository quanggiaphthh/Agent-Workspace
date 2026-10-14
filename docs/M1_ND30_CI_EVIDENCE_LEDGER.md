# M1 — Evidence Ledger · targeted CI đã thực thi

**Ngày chạy:** 2026-10-14 (UTC). **Targeted CI: PASS.** **Final Gate M1: BLOCKED** (chưa đủ bằng chứng để khép toàn bộ M1).

## 1. Nguồn chuẩn và provenance

| Đối tượng | SHA / thông tin đã kiểm tra |
|---|---|
| Production | `quanggiaphthh/Agent-Workspace` |
| `main` lúc xác minh | `7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1` |
| Nhánh CI | `task/m1-nd30-ci-evidence-20261014` |
| Workflow | `.github/workflows/m1-nd30-targeted.yml` |
| Commit workflow ban đầu | `c47200656ebe33637c83e8b64e8a16c6643cfd3e` |
| Commit đã CI PASS | `7aed1f9a6f67ec037d204a6790b598d6253d62e5` |
| ND30 rule authority `main` | `078dae21f9e23975676179fa189f5c01b605f49a` |
| Docs-ND30 | Chỉ tham khảo kỹ thuật; không checkout/build |

**Đã đóng blocker lỗi thời:** `DOCS_ND30_READ_TOKEN` không còn là điều kiện tiên quyết. Không nghiên cứu lại Nghị định 30 gốc, không lấy Docs-ND30 làm rule authority.

## 2. Nhật ký 4 lượt GitHub Actions

| Run ID | Commit | Kết quả | Nguyên nhân / bằng chứng |
|---|---|---|---|
| [38604622559](https://github.com/quanggiaphthh/Agent-Workspace/actions/runs/38604622559) | `7a90f0eed52f741b033848860f05bc16cf8ec5b6` | FAIL | `git merge-base` exit **128**, thiếu history do checkout depth 1 |
| [38604721084](https://github.com/quanggiaphthh/Agent-Workspace/actions/runs/38604721084) | `ea5c87b11e9a1e29a97abb44726730fab0c7aab6` | FAIL | Targeted tests exit **1**: 2 suite thiếu cấu hình Firebase client; 215 tests PASS |
| [38604873268](https://github.com/quanggiaphthh/Agent-Workspace/actions/runs/38604873268) | `2577c71b2d92ad707ac9daaf34655b19d5ac20de` | FAIL | 24/24 suite, 220/220 tests PASS; worker probe exit **1** vì kế thừa `--input-type=module` |
| [38605043453](https://github.com/quanggiaphthh/Agent-Workspace/actions/runs/38605043453) | `7aed1f9a6f67ec037d204a6790b598d6253d62e5` | **SUCCESS** | 24/24 test suites, 220/220 tests PASS, mọi bước job thành công |

**Job ID cuối:** `115993649715`. **Run ID:** `38605043453`. Log gốc: trang run ở bảng trên → job `targeted` → Download log / View raw logs. GitHub ghi nhận `status=completed`, `conclusion=success`, `head_sha` khớp commit trên.

## 3. Command và exit-code evidence (run PASS)

| Bước / command | Kết quả |
|---|---|
| `git rev-parse HEAD` và `git merge-base --is-ancestor 7adc5f3... HEAD` | Step success; exit 0 |
| `npm ci --ignore-scripts --no-audit --no-fund` | Step success; exit 0 |
| `npm run build` | Step success; exit 0 |
| `node --check server/modules/document-formatting/docxWorker.mjs` | Step success; exit 0 |
| `test -s dist/docx.worker.cjs` | Step success; exit 0 |
| `node --check dist/docx.worker.cjs` | Step success; exit 0 |
| `./node_modules/.bin/vitest run "${tests[@]}"` | 24 files / 220 tests PASS; exit 0 |
| Worker ESM probe, 4 operations | Step success; exit 0; mỗi operation trả `MALFORMED_DOCX` |

Exit 0 của các shell step thành công suy ra từ **GitHub step conclusion=success**, không phải chuỗi "exit code 0" được in riêng cho từng lệnh. Lệnh trong mỗi step được lưu trong workflow và job logs.

## 4. Phạm vi chứng cứ âm tính đã chạy

- API/Auth, permission và request-scoped ownership: các test hiện hữu trong `server/core/documents/__tests__`, `server/core/capabilities/__tests__`, `src/__tests__` cùng test mới.
- Module enable/disable/rejected-toggle rollback: `src/modules/settings/ModuleManagerTab.test.tsx`.
- Worker: inspect, applyAlignment, applyTopMargin, applyAdministrativePageLayout với giả/hỏng DOCX; probe và `m1TargetedNegative.test.ts`.
- ZIP bomb/expansion, input 20 MiB, invalid deadlines, timeout, busy guard: `server/modules/document-formatting/m1TargetedNegative.test.ts`.
- DOCX package parser / format fidelity: `docxPackage.test.mjs` đã được thêm vào danh sách targeted tests.
- XSS hostile API-error rendering: `src/modules/document-formatting/__tests__/M1DocumentFormattingXss.test.tsx`.
- Không tự tạo dữ kiện hành chính: phép thử so sánh các giá trị `w:t` trước/sau cho fixture DOCX cụ thể.

**Giới hạn:** các test là bằng chứng bounded unit/integration CI, không thay thế e2e trên backend xác thực triển khai thực, QA bản in Microsoft Word, hoặc chứng minh mọi rule đã được engine nạp từ nguồn chuẩn.

## 5. Kết luận cần đồng bộ và blocker còn mở

- **TARGETED_CI: PASS** — các bước workflow đã chạy thành công trên SHA ghi nhận.
- **FULL_M1_FINAL_GATE: BLOCKED** vì 9 tài liệu báo cáo M1 trong ZIP trước đó không có dưới dạng tệp riêng trong cây nhánh này để hiệu chỉnh/xác minh; và workflow chỉ ghi SHA rule authority trong log, chưa chứng minh end-to-end nguồn rule được tích hợp với compliance engine.
- API/Auth đã có negative tests, nhưng test trên endpoint production/live và thử nghiệm visual fidelity không được đưa vào run này: **NOT_EVALUATED**, không được nâng thành PASS.
- Không mở M2–M5; không triển khai văn bản Đảng, Hướng dẫn 05, PDF; không dùng Firebase Storage/Firestore lưu tài liệu. Không merge, deploy hoặc thay đổi `main`.

Tài liệu này là ledger của kết quả đã thực thi, không phải chứng nhận tuân thủ NĐ30 toàn diện.

# Agent-Workspace — H5.4.1 iPad Safari temporal-input corrective

Purpose: correct the real-iPad Safari overflow of native `input[type="date"]` and
`input[type="time"]` in the shared TaskFields form while preserving the native
date/time input types and the existing stacked layout.

This package supersedes H5.4 corrective v2 and includes all H5.4 v2 changes.

H5.4.1 delta:
- TaskFormModal.tsx / shared TaskFields only.
- Date/time controls now use the same bounded geometry as the other fields:
  block, h-11, inline-size 100%, min/max inline-size bounds.
- Native WebKit visual intrinsic sizing is neutralized with appearance:none.
- Input types remain `date` and `time`; no custom picker and no dependency.
- Create and Inspector receive the same fix because both reuse TaskFields.

Real-iPad acceptance:
1. Hạn ngày and Giờ hạn left/right edges match Phân loại/Ghi chú.
2. Neither control extends beyond Create modal or Inspector.
3. Date and time controls still open the native iPad picker.
4. No clipping of field border/value.
5. Create and Inspector retain stacked date/time layout.

AI Studio preview is useful for functional verification but does not replace the
real-iPad Safari acceptance gate.

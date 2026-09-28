# Agent-Workspace H5.4 corrective v2

Baseline authority:
- Repository: quanggiaphthh/Agent-Workspace
- main: baf86f26df8e73fdb23e96cc9fb49f43e9a9f52d
- commit: feat(tasks): enable stacked date layout in task form

Scope:
1. Inspector reserves width only at 2xl desktop.
2. Board completed metadata uses compact Vietnamese timestamp.
3. Disabled due-time control gets bounded screen-reader explanation.
4. Create modal contains Tab/Shift+Tab focus.
5. Create modal restores focus to the exact opener captured BEFORE opening,
   avoiding the React autoFocus lifecycle defect found in candidate v1.
6. Adds compact timestamp unit coverage.

No backend/schema/API/Firestore/Agent/Gemini/ADK/dependency/package changes.

Required verification after applying to a full canonical checkout:
- npm test -- src/modules/tasks/taskUtils.test.ts
- npm test
- npm run lint
- npm run build
- git diff --check
- real-iPad acceptance

Do not call real-iPad PASS until tested on the device.

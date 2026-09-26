import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decideRouteRestoration } from '../core/navigation/NavigationSync';

const canonicalRoutes = ['/', '/tasks', '/settings'];
const enabledRoutes = ['/', '/tasks', '/settings'];
const decide = (currentPathname: string, savedPathname: string | null, isEmbedded: boolean, enabledModuleRoutes = enabledRoutes, isInitialSync = true) => decideRouteRestoration({
  currentPathname,
  savedPathname,
  isEmbedded,
  isInitialSync,
  canonicalModuleRoutes: canonicalRoutes,
  enabledModuleRoutes,
});
const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('H5.1 route restoration decision', () => {
  it('A. preserves /tasks when saved route is /settings', () => {
    expect(decide('/tasks', '/settings', true)).toEqual({ restorePath: null, persistPath: '/tasks' });
  });

  it('B. preserves /settings when saved route is /tasks', () => {
    expect(decide('/settings', '/tasks', true)).toEqual({ restorePath: null, persistPath: '/settings' });
  });

  it('C. restores valid /tasks from embedded root', () => {
    expect(decide('/', '/tasks', true)).toEqual({ restorePath: '/tasks', persistPath: null });
  });

  it('D. restores valid /settings from embedded root', () => {
    expect(decide('/', '/settings', true)).toEqual({ restorePath: '/settings', persistPath: null });
  });

  it('E. rejects an invalid saved route', () => {
    expect(decide('/', '/invalid', true)).toEqual({ restorePath: null, persistPath: '/' });
  });

  it('F. rejects a disabled saved module route', () => {
    expect(decide('/', '/tasks', true, ['/', '/settings'])).toEqual({ restorePath: null, persistPath: '/' });
  });

  it('G. keeps Home when the saved route is /', () => {
    expect(decide('/', '/', true)).toEqual({ restorePath: null, persistPath: '/' });
  });

  it('H. does not restore a saved module on a non-embedded direct root URL', () => {
    expect(decide('/', '/tasks', false)).toEqual({ restorePath: null, persistPath: '/' });
  });

  it('keeps Home when the user navigates there after the initial sync', () => {
    expect(decide('/', '/tasks', true, enabledRoutes, false)).toEqual({ restorePath: null, persistPath: '/' });
  });
});

describe('H5.1 bounded runtime UX corrective contract', () => {
  it('uses sessionStorage-only module path persistence with replace navigation', () => {
    const source = read('src/core/navigation/NavigationSync.tsx');
    expect(source).toContain('window.sessionStorage');
    expect(source).not.toContain('localStorage');
    expect(source).toContain('replace: true');
  });

  it('keeps Agent docked only on sufficiently wide desktop viewports', () => {
    const source = read('src/app/shell/AppShell.tsx');
    expect(source).toContain("(min-width: 1600px)");
    expect(source).not.toContain("(min-width: 1280px)");
  });

  it('removes the duplicate Canvas module heading while retaining refresh and maximize', () => {
    const source = read('src/app/shell/Canvas.tsx');
    expect(source).not.toContain('activeModule?.meta?.name');
    expect(source).not.toContain('activeModule?.meta?.description');
    expect(source).toContain('canvas.refreshRequested');
    expect(source).toContain('Maximize2');
  });

  it('keeps TaskViewMode two-valued and exposes report as a secondary surface', () => {
    const source = read('src/modules/tasks/TasksModule.tsx');
    expect(source).toContain("type TaskViewMode = 'board' | 'list'");
    expect(source).toContain('const [showReport, setShowReport] = useState(false)');
    expect(source).toContain('Báo cáo công việc');
    expect(source).not.toContain('min-h-[68px]');
  });

  it('lets a single Home widget span the available dashboard width', () => {
    const source = read('src/modules/home/HomeModule.tsx');
    expect(source).toContain("widgets.length === 1 || widget.width === 'full'");
    expect(source).toContain('moduleRegistry.getWidgets(user)');
  });

  it('does not render an unset deadline label on Board/List cards', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const boardSource = read('src/modules/tasks/TaskBoard.tsx');
    expect(moduleSource).toContain('task.dueDate &&');
    expect(boardSource).toContain('task.dueDate &&');
    expect(moduleSource).not.toContain('Chưa đặt hạn');
    expect(boardSource).not.toContain('Chưa đặt hạn');
  });
});

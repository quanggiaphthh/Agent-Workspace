import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useContextStore } from '../context/contextStore';
import { moduleRegistry } from '../modules/moduleRegistry';

export const MODULE_PATH_SESSION_KEY = 'agent-workspace:last-module-path';

type RouteRestorationInput = {
  currentPathname: string;
  savedPathname: string | null;
  isEmbedded: boolean;
  isInitialSync: boolean;
  canonicalModuleRoutes: readonly string[];
  enabledModuleRoutes: readonly string[];
};

export type RouteRestorationDecision = {
  restorePath: string | null;
  persistPath: string | null;
};

export function decideRouteRestoration({
  currentPathname,
  savedPathname,
  isEmbedded,
  isInitialSync,
  canonicalModuleRoutes,
  enabledModuleRoutes,
}: RouteRestorationInput): RouteRestorationDecision {
  if (currentPathname !== '/') {
    return {
      restorePath: null,
      persistPath: canonicalModuleRoutes.includes(currentPathname) ? currentPathname : null,
    };
  }

  if (
    isInitialSync
    && isEmbedded
    && savedPathname
    && savedPathname !== '/'
    && enabledModuleRoutes.includes(savedPathname)
  ) {
    return { restorePath: savedPathname, persistPath: null };
  }

  return { restorePath: null, persistPath: '/' };
}

function readSavedModulePath(): string | null {
  try {
    return window.sessionStorage.getItem(MODULE_PATH_SESSION_KEY);
  } catch {
    return null;
  }
}

function persistModulePath(pathname: string | null): void {
  try {
    if (pathname) window.sessionStorage.setItem(MODULE_PATH_SESSION_KEY, pathname);
    else window.sessionStorage.removeItem(MODULE_PATH_SESSION_KEY);
  } catch {
    // Storage may be unavailable in restricted embedded contexts.
  }
}

export function NavigationSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialSyncRef = useRef(true);
  const setActiveRoute = useContextStore(state => state.setActiveRoute);
  const setActiveModule = useContextStore(state => state.setActiveModule);

  useEffect(() => {
    const path = location.pathname;
    const canonicalModuleRoutes = moduleRegistry
      .listAll()
      .flatMap((module) => module.routes || [])
      .map((route) => route.path);
    const enabledModuleRoutes = moduleRegistry.getRoutes().map((route) => route.path);
    const isInitialSync = initialSyncRef.current;
    initialSyncRef.current = false;
    const decision = decideRouteRestoration({
      currentPathname: path,
      savedPathname: readSavedModulePath(),
      isEmbedded: window.self !== window.top,
      isInitialSync,
      canonicalModuleRoutes,
      enabledModuleRoutes,
    });

    if (decision.restorePath) {
      navigate({ to: decision.restorePath as any, replace: true });
      return;
    }

    persistModulePath(decision.persistPath);
    setActiveRoute(path);

    const moduleId = moduleRegistry.resolveModuleByPath(path);
    setActiveModule(moduleId);
  }, [location.pathname, navigate, setActiveRoute, setActiveModule]);

  return null;
}

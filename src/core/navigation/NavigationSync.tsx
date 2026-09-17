import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useContextStore } from '../context/contextStore';
import { moduleRegistry } from '../modules/moduleRegistry';

export function NavigationSync() {
  const location = useLocation();
  const setActiveRoute = useContextStore(state => state.setActiveRoute);
  const setActiveModule = useContextStore(state => state.setActiveModule);

  useEffect(() => {
    const path = location.pathname;
    setActiveRoute(path);

    // Resolve module from path using registry
    const moduleId = moduleRegistry.resolveModuleByPath(path);
    setActiveModule(moduleId);
  }, [location.pathname, setActiveRoute, setActiveModule]);

  return null;
}

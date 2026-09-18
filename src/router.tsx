import React from 'react';
import { 
  createRootRoute, 
  createRoute, 
  createRouter, 
  Outlet, 
  useNavigate, 
  useLocation,
  Navigate
} from '@tanstack/react-router';
import { moduleRegistry } from './core/modules/moduleRegistry';
import { AppShell } from './app/shell/AppShell';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Power, Home } from 'lucide-react';
import { useContextStore } from './core/context/contextStore';

// 1. Root Route - The App Shell Layout
const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

// 2. Module Guard Component
const ModuleGuard = ({ moduleId, component: Component }: { moduleId: string, component: React.ComponentType }) => {
  const isEnabled = moduleRegistry.isEnabled(moduleId);
  const user = useContextStore(state => state.user);
  const hasAccess = moduleRegistry.hasAccess(moduleId, user);

  if (!isEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-neutral-50/50">
        <Card className="max-w-md w-full p-6 text-center space-y-4 border-amber-200 bg-amber-50/50">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
            <Power className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-amber-900">
              Phân hệ "{moduleId}" đang bị tắt
            </h2>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Phân hệ này đã bị vô hiệu hóa trong trình quản lý. Các tính năng và đường dẫn hiện không khả dụng.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                window.location.href = '/';
              }}
              className="text-xs"
            >
              <Home className="h-3.5 w-3.5 mr-1" />
              Về trang chủ
            </Button>
          </div>
        </Card>
      </div>
    );
  }


  if (!hasAccess) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-neutral-50/50">
        <Card className="max-w-md w-full p-6 text-center space-y-4 border-rose-200 bg-rose-50/50">
          <div>
            <h2 className="text-base font-bold text-rose-900">Không có quyền truy cập</h2>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed">
              Tài khoản hiện tại không có quyền sử dụng phân hệ này.
            </p>
          </div>
          <Button variant="default" size="sm" onClick={() => { window.location.href = '/'; }} className="text-xs">
            <Home className="h-3.5 w-3.5 mr-1" />
            Về trang chủ
          </Button>
        </Card>
      </div>
    );
  }

  return <Component />;
};

// 3. Dynamic Route Generation
// Note: In TanStack Router, we typically need a fixed tree at build time for type safety,
// but for this P0 spec, we will build it dynamically using the registry.
export function createDynamicRouter() {
  const allModules = moduleRegistry.listAll();
  
  const moduleRoutes = allModules.flatMap(mod => {
    return (mod.routes || []).map(routeDef => {
      // Create a route for each contribution
      return createRoute({
        getParentRoute: () => rootRoute,
        path: routeDef.path === '/' ? '/' : routeDef.path.startsWith('/') ? routeDef.path : `/${routeDef.path}`,
        component: () => <ModuleGuard moduleId={mod.id} component={routeDef.component} />,
      });
    });
  });

  const routeTree = rootRoute.addChildren(moduleRoutes);
  
  return createRouter({ 
    routeTree,
    defaultPreload: 'intent',
  });
}

// Global instance removed to support dynamic creation after bootstrap
// export const router = createDynamicRouter();

// Register the router for maximum type safety (optional for prototype)
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createDynamicRouter>
  }
}

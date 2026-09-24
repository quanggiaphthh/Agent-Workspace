/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createDynamicRouter } from './router';
import { bootstrapClient } from './bootstrap';
import { Button } from './components/ui/Button';

export function getBootstrapErrorMessage(_error: unknown): string {
  return 'Không thể mở không gian làm việc lúc này. Vui lòng thử lại.';
}

export default function App() {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);

  const startBootstrap = useCallback(() => {
    setBootstrapped(false);
    setBootstrapError(null);

    void bootstrapClient()
      .then(() => {
        setBootstrapped(true);
      })
      .catch((error: unknown) => {
        console.error('[Client Bootstrap] Failed to initialize the workspace.', error);
        setBootstrapError(error);
      });
  }, []);

  useEffect(() => {
    startBootstrap();
  }, [startBootstrap]);

  const router = useMemo(() => {
    if (!bootstrapped) return null;
    return createDynamicRouter();
  }, [bootstrapped]);

  if (bootstrapError) {
    return (
      <main
        className="h-screen w-screen flex items-center justify-center bg-neutral-900 px-6 text-white"
        role="alert"
      >
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-xl font-bold text-neutral-900">
            M
          </div>
          <div>
            <h1 className="text-base font-semibold">Không thể mở không gian làm việc</h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
              {getBootstrapErrorMessage(bootstrapError)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={startBootstrap}>
            Thử lại
          </Button>
        </div>
      </main>
    );
  }

  if (!bootstrapped || !router) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-white text-neutral-900 flex items-center justify-center font-bold text-xl animate-pulse">
            M
          </div>
          <div className="text-sm font-medium tracking-tight text-neutral-400">
            Đang mở không gian làm việc...
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}


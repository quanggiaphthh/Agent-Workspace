/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createDynamicRouter } from './router';
import { bootstrapClient } from './bootstrap';

export default function App() {
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    bootstrapClient().then(() => {
      setBootstrapped(true);
    });
  }, []);

  const router = useMemo(() => {
    if (!bootstrapped) return null;
    return createDynamicRouter();
  }, [bootstrapped]);

  if (!bootstrapped || !router) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-white text-neutral-900 flex items-center justify-center font-bold text-xl animate-pulse">
            M
          </div>
          <div className="text-sm font-medium tracking-tight text-neutral-400">
            Đang khởi tạo hệ thống Trợ lý...
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}



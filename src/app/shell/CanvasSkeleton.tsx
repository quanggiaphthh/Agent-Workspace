import React from 'react';

export function CanvasSkeleton() {
  return (
    <div className="w-full h-full flex flex-col space-y-6 animate-pulse p-2">
      {/* Top Banner / Hero Skeleton */}
      <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 bg-neutral-200 rounded-md" />
            <div className="h-3.5 w-72 bg-neutral-100 rounded-md" />
          </div>
          <div className="h-9 w-28 bg-neutral-200 rounded-xl" />
        </div>
      </div>

      {/* Grid Content Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 bg-white rounded-xl border border-neutral-200/80 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-neutral-200 rounded" />
              <div className="h-6 w-6 bg-neutral-100 rounded-full" />
            </div>
            <div className="h-8 w-20 bg-neutral-300 rounded" />
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full bg-neutral-100 rounded" />
              <div className="h-3 w-4/5 bg-neutral-100 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Table / List Section Skeleton */}
      <div className="p-5 bg-white rounded-xl border border-neutral-200/80 space-y-4 shadow-2xs flex-1">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="h-4 w-36 bg-neutral-200 rounded" />
          <div className="h-8 w-24 bg-neutral-100 rounded" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center justify-between py-2.5 border-b border-neutral-50">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-neutral-200 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-44 bg-neutral-200 rounded" />
                  <div className="h-3 w-28 bg-neutral-100 rounded" />
                </div>
              </div>
              <div className="h-6 w-20 bg-neutral-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

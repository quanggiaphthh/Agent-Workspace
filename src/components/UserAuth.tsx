import React from 'react';
import { useFirebaseAuth } from '../lib/FirebaseAuthProvider';
import { Button } from './ui/Button';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export function UserAuth() {
  const { user, login, logout, loading } = useFirebaseAuth();

  if (loading) {
    return <div className="h-8 w-8 rounded-full bg-neutral-100 animate-pulse" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden md:flex flex-col items-end mr-1">
          <span className="text-[10px] font-bold text-neutral-900 leading-none truncate max-w-[100px]">
            {user.displayName || user.email}
          </span>
          <span className="text-[9px] text-neutral-500 leading-none mt-1">Đã đăng nhập</span>
        </div>
        <div className="group relative">
          <button 
            onClick={() => logout()}
            className="h-8 w-8 rounded-full border border-neutral-200 overflow-hidden bg-neutral-50 flex items-center justify-center hover:border-rose-300 transition-colors"
            title="Đăng xuất"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-4 w-4 text-neutral-400" />
            )}
            <div className="absolute inset-0 bg-rose-500/0 group-hover:bg-rose-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <LogOut className="h-3.5 w-3.5 text-rose-600" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => login()}
      className="h-8 text-xs gap-1.5 border-neutral-200 hover:bg-neutral-50"
    >
      <LogIn className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Đăng nhập</span>
    </Button>
  );
}

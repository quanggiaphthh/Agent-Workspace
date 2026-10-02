import React, { useEffect, useRef, useState } from 'react';
import { useFirebaseAuth } from '../lib/FirebaseAuthProvider';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { AlertCircle, LogIn, LogOut, User as UserIcon, X } from 'lucide-react';

function getLoginErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Địa chỉ email không hợp lệ.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email hoặc mật khẩu không đúng.';
    case 'auth/user-disabled':
      return 'Tài khoản này hiện không thể đăng nhập.';
    case 'auth/too-many-requests':
      return 'Có quá nhiều lần thử. Vui lòng chờ rồi thử lại.';
    case 'auth/network-request-failed':
      return 'Không kết nối được dịch vụ đăng nhập. Hãy kiểm tra mạng rồi thử lại.';
    case 'auth/operation-not-allowed':
      return 'Đăng nhập bằng email và mật khẩu chưa được bật trong Firebase.';
    default:
      return 'Không thể đăng nhập. Vui lòng kiểm tra thông tin rồi thử lại.';
  }
}

export function UserAuth() {
  const { user, login, logout, loading } = useFirebaseAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const loginTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loginOpen) return;
    const trigger = loginTriggerRef.current;
    dialogRef.current?.querySelector<HTMLInputElement>('#login-email')?.focus();
    return () => trigger?.focus();
  }, [loginOpen]);

  const closeLogin = () => {
    if (submitting) return;
    setLoginOpen(false);
    setEmail('');
    setPassword('');
    setLoginError(null);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      setLoginOpen(false);
      setEmail('');
      setPassword('');
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLogin();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.tabIndex >= 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
            type="button"
            onClick={() => logout()}
            aria-label="Đăng xuất"
            className="h-8 w-8 rounded-full border border-neutral-200 overflow-hidden bg-neutral-50 flex items-center justify-center hover:border-rose-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
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
    <>
      <Button
        ref={loginTriggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setLoginError(null);
          setLoginOpen(true);
        }}
        className="h-8 text-xs gap-1.5 border-neutral-200 hover:bg-neutral-50"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Đăng nhập</span>
      </Button>

      {loginOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            aria-label="Đóng hộp thoại đăng nhập"
            onClick={closeLogin}
            disabled={submitting}
          />
          <section
            ref={dialogRef}
            className="relative z-10 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-dialog-title"
            onKeyDown={handleDialogKeyDown}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="login-dialog-title" className="text-base font-semibold text-neutral-900">Đăng nhập</h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Dùng tài khoản email và mật khẩu đã đăng ký trong Firebase.
                </p>
              </div>
              <button
                type="button"
                onClick={closeLogin}
                disabled={submitting}
                aria-label="Đóng"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-neutral-700">Email</label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-neutral-700">Mật khẩu</label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                />
              </div>

              {loginError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{loginError}</span>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-neutral-500">
                Mật khẩu Google không thay thế mật khẩu đăng nhập Firebase.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={closeLogin} disabled={submitting}>
                  Hủy
                </Button>
                <Button type="submit" disabled={submitting || !email.trim() || !password}>
                  {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

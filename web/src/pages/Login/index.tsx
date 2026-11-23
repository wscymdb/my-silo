import React, { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';

export default function LoginPage() {
  const { token, setToken } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = params.get('from') || '/';
  const returnTo = from.startsWith('/') && !from.startsWith('//') && from.split(/[?#]/)[0] !== '/login' ? from : '/';
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || '密码验证失败');
        return;
      }
      setToken(data.token);
      navigate(returnTo, { replace: true });
    } catch {
      setLoginError('连接后端异常');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (token) return <Navigate to={returnTo} replace />;
  return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 selection:bg-zinc-900 selection:text-white">
        <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col space-y-1.5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center">
                <HardDrive className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-base font-semibold leading-none tracking-tight text-zinc-900">my-silo</h3>
            </div>
            <p className="text-xs text-zinc-500">输入管理员凭证以访问资源服务</p>
          </div>

          {loginError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">账号</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">密码</label>
              <input
                type="password"
                value={password}
                autoFocus
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn || !password}
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
            >
              {isLoggingIn ? '验证中...' : '进入控制台'}
            </button>
          </form>
        </div>
      </div>
  );
}

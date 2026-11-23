import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import SettingsLayout from '../layouts/SettingsLayout';
import { useApp } from '../providers/AppProvider';
import { allRoutes } from './autoRoutes';

function AuthGuard() {
  const { token } = useApp();
  const location = useLocation();
  if (!token) {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return <Outlet />;
}
function PageTitle() {
  const location = useLocation();
  useEffect(() => {
    const page = allRoutes.find(route => route.path === location.pathname);
    document.title = page ? `${page.title} · my-silo` : 'my-silo';
  }, [location.pathname]);
  return null;
}
function PageLoading() {
  return <div role="status" className="h-64 flex items-center justify-center text-xs text-zinc-400">载入页面中...</div>;
}
export function AppRouter() {
  return (
    <BrowserRouter>
      <PageTitle />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {allRoutes.filter(route => route.layout === 'none').map(route => (
            <Route key={route.path} path={route.path} element={<route.component />} />
          ))}
          <Route element={<AuthGuard />}>
            {allRoutes.filter(route => route.layout === 'home').map(route => (
              <Route key={route.path} path={route.path} element={<route.component />} />
            ))}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/general" replace />} />
              {allRoutes.filter(route => route.layout === 'settings').map(route => (
                <Route key={route.path} path={route.path} element={
                  <Suspense fallback={<PageLoading />}><route.component /></Suspense>
                } />
              ))}
              <Route path="*" element={<Navigate to="/settings/general" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

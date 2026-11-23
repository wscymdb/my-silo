import { ArrowLeft } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { settingsMenuItems } from '../../router/autoRoutes';
import { SettingsProvider, useSettings } from '../../providers/SettingsProvider';

export default function SettingsLayout() {
  return <SettingsProvider><SettingsShell /></SettingsProvider>;
}
function SettingsShell() {
  const { loading } = useSettings();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans text-zinc-950 selection:bg-zinc-900 selection:text-white">
      {/* 顶部通栏 Navbar */}
      <header className="h-14 border-b border-zinc-200/80 px-6 flex items-center justify-between bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-1 -ml-1 text-zinc-400 hover:text-zinc-900 transition-colors flex items-center justify-center cursor-pointer"
            title="返回文件库"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-900">系统设置</span>
        </div>
      </header>

      {/* 主体设置双栏布局 (shadcn 标准 Settings 布局) */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 flex flex-col md:flex-row gap-8">
        {/* 左侧分类导航菜单 */}
        <aside className="w-full md:w-56 shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {settingsMenuItems.map(item => {
              const Icon = item.icon;
              return (
                <NavLink key={item.path} to={item.path}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${isActive ? 'bg-zinc-100 text-zinc-950 font-semibold' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}>
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  {item.title}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* 右侧表单内容区 */}
        <main className="flex-1 max-w-2xl">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-400">载入设置中...</div>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}

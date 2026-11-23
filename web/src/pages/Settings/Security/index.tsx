import { useSettings } from '../../../providers/SettingsProvider';

export default function SecurityPage() {
  const { saving, globalAllowedIPs, setGlobalAllowedIPs, globalBlockedIPs, setGlobalBlockedIPs, stats, handleSaveSecurity } = useSettings();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900 leading-none">安全与全局 IP 控制</h3>
        <p className="text-xs text-zinc-500 mt-1.5">配置全站通用的 IP 白名单与恶意 IP 拦截黑名单。</p>
      </div>

      <form onSubmit={handleSaveSecurity} className="space-y-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-800">
                全局 IP 白名单 (Global Allowed IPs)
              </label>
              {stats?.client_ip && (
                <button
                  type="button"
                  onClick={() => {
                    const ips = globalAllowedIPs ? globalAllowedIPs.split(',').map(s => s.trim()) : [];
                    if (!ips.includes(stats.client_ip)) {
                      ips.push(stats.client_ip);
                      setGlobalAllowedIPs(ips.join(', '));
                    }
                  }}
                  className="text-[11px] text-zinc-900 hover:underline font-medium"
                >
                  + 填入当前客户端 IP ({stats.client_ip})
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="例如: 123.45.67.89, 192.168.1.0/24"
              value={globalAllowedIPs}
              onChange={e => setGlobalAllowedIPs(e.target.value)}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              设为白名单模式的文件将直接继承此全局允许列表（支持单个 IPv4/IPv6 或 CIDR 网段）。
            </p>
          </div>

          <div className="pt-3 border-t border-zinc-100">
            <label className="block text-xs font-medium text-zinc-800 mb-1">
              全局恶意 IP 黑名单 (Global Blocked IPs)
            </label>
            <input
              type="text"
              placeholder="例如: 203.0.113.5, 198.51.100.0/24"
              value={globalBlockedIPs}
              onChange={e => setGlobalBlockedIPs(e.target.value)}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              黑名单中的 IP 发起任何资源请求均直接被硬性阻断并返回 403。
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存策略'}
          </button>
        </div>
      </form>
    </div>
  );
}

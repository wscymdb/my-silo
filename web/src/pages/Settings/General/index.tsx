import { useSettings } from '../../../providers/SettingsProvider';

export default function GeneralPage() {
  const { saving, customDomain, setCustomDomain, defaultAccessType, setDefaultAccessType, handleSaveGeneral } = useSettings();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900 leading-none">常规与外链域名</h3>
        <p className="text-xs text-zinc-500 mt-1.5">配置公网访问外链的生成地址与默认策略。</p>
      </div>

      <form onSubmit={handleSaveGeneral} className="space-y-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-800 mb-1">
              公网外链域名 (Base URL)
            </label>
            <input
              type="text"
              placeholder="例如: https://silo.yourdomain.com"
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value)}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              生成直链或 Markdown 语法时自动拼接此域名。留空则自动跟随当前浏览器访问地址。
            </p>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <label className="block text-xs font-medium text-zinc-800 mb-2">
              默认上传访问策略
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['public', 'ip_whitelist', 'private'] as const).map(type => (
                <label
                  key={type}
                  className={`flex items-center gap-2 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                    defaultAccessType === type
                      ? 'border-zinc-900 bg-zinc-50 font-medium text-zinc-950'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="defaultAccess"
                    value={type}
                    checked={defaultAccessType === type}
                    onChange={() => setDefaultAccessType(type)}
                    className="accent-zinc-900"
                  />
                  <span>
                    {type === 'public' && '全公开'}
                    {type === 'ip_whitelist' && 'IP 白名单'}
                    {type === 'private' && '仅私有'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useSettings } from '../../../providers/SettingsProvider';
import { Copy, RefreshCw } from 'lucide-react';

export default function ApiPage() {
  const { apiKey, handleRegenerateKey, copyToClipboard, picGoConfigJson } = useSettings();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900 leading-none">API 凭证与图床客户端</h3>
        <p className="text-xs text-zinc-500 mt-1.5">用于配合 PicGo、Typora、Raycast 等工具一键上传文件。</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-800">当前 API Key</label>
            <button
              type="button"
              onClick={handleRegenerateKey}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              重新生成
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={apiKey || '暂未生成固定 Key（当前支持通过登录 Token 访问）'}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-mono text-zinc-800 focus:outline-none"
            />
            {apiKey && (
              <button
                type="button"
                onClick={() => copyToClipboard(apiKey, 'API Key')}
                className="inline-flex h-9 px-3 items-center justify-center rounded-md border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                拷贝
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-800">PicGo 图床自定义配置参考</label>
            <button
              type="button"
              onClick={() => copyToClipboard(picGoConfigJson, 'PicGo 配置')}
              className="text-[11px] text-zinc-900 hover:underline font-medium"
            >
              拷贝配置 JSON
            </button>
          </div>
          <pre className="p-3 bg-zinc-50 rounded-md border border-zinc-200 text-[11px] font-mono text-zinc-700 overflow-x-auto leading-relaxed">
            {picGoConfigJson}
          </pre>
        </div>
      </div>
    </div>
  );
}

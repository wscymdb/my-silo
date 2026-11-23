import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FileText, RefreshCw, Save } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApp } from '../../providers/AppProvider';
import { readTextResponse, type TextFileData } from './readTextResponse';
const TextEditor = lazy(() => import('./components/TextEditor'));

const limit = 1024 * 1024;

export default function TextFilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, setToken, showToast } = useApp();
  const [file, setFile] = useState<TextFileData | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [mode, setMode] = useState<'preview' | 'edit' | 'split'>('preview');
  const saveInFlight = useRef(false);
  const dirty = !!file && draft !== file.content;
  const byteLength = useMemo(() => new TextEncoder().encode(draft).length, [draft]);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('有未保存的修改，确定离开并放弃修改吗？')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFile(null);
    setError('');
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(id ?? '')}/content`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
      });
      if (response.status === 401) { setToken(''); return; }
      const data = await readTextResponse(response);
      if (signal?.aborted) return;
      setFile(data);
      setDraft(data.content);
      setMode('preview');
      setEditorReady(false);
      setConflict(false);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : '读取文件失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id, token, setToken]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (file) document.title = `${file.name} · my-silo`;
  }, [file]);

  const save = useCallback(async () => {
    if (!file || !dirty || saveInFlight.current || byteLength > limit || conflict) return;
    const submitted = draft;
    saveInFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(file.id)}/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: submitted, version: file.version }),
      });
      if (response.status === 401) { setToken(''); return; }
      if (response.status === 409) setConflict(true);
      const data = await readTextResponse(response);
      setFile(data);
      // Keep any typing that happened while the request was in progress.
      setDraft(current => current === submitted ? data.content : current);
      showToast('文件已保存');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，修改仍保留在编辑器中');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [file, dirty, draft, byteLength, conflict, token, setToken, showToast]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  }, [save]);

  const reload = () => {
    if (!dirty || window.confirm('重新加载将放弃未保存的修改，确定继续吗？')) void load();
  };
  const isMarkdown = file?.format === 'markdown';
  const modes = isMarkdown ? ['preview', 'edit', 'split'] as const : ['preview', 'edit'] as const;
  const labels = { preview: '预览', edit: '编辑', split: '分屏' };

  return (
    <div className="flex h-dvh flex-col bg-white text-zinc-950">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 md:px-6">
        <button type="button" title="返回文件库" aria-label="返回文件库" onClick={() => navigate('/')}
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100"><ArrowLeft className="h-4 w-4" /></button>
        <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{file?.name || '文本文件'}</h1>
        {file && !loading && <>
          <span role="status" className="text-xs text-zinc-500">{dirty ? '未保存' : '已保存'}</span>
          <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5" aria-label="查看方式">
            {modes.map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); if (value !== 'preview') setEditorReady(true); }}
              className={`rounded px-3 py-1 text-xs ${mode === value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>{labels[value]}</button>)}
          </div>
          <a href={`/d/${file.id}`} download title="下载" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100"><Download className="h-4 w-4" /></a>
          <button type="button" disabled={!dirty || saving || byteLength > limit || conflict} onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
            <Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存'}
          </button>
        </>}
      </header>
      {error && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-red-100 bg-red-50 px-6 py-3 text-xs text-red-700">
        <span className="flex-1">{error}</span>
        {conflict && <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => {
          navigator.clipboard.writeText(draft).then(() => showToast('已复制你的修改'), () => showToast('复制失败，请在编辑器中手动复制'));
        }}><Copy className="h-3.5 w-3.5" />复制我的修改</button>}
        <button type="button" onClick={reload} disabled={saving} className="inline-flex items-center gap-1 underline"><RefreshCw className="h-3.5 w-3.5" />重新加载</button>
      </div>}
      {loading ? <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">正在读取文件…</div> : file && (
        <>
          <main className={`grid min-h-0 flex-1 ${mode === 'split' ? 'grid-rows-2 md:grid-cols-2 md:grid-rows-1' : 'grid-cols-1'}`}>
            <section aria-label="编辑区域" className={`min-h-0 min-w-0 overflow-hidden ${mode === 'preview' ? 'hidden' : ''} ${mode === 'split' ? 'border-b border-zinc-200 md:border-b-0 md:border-r' : ''}`}>
              <Suspense fallback={<div className="p-6 text-xs text-zinc-400">正在加载编辑器…</div>}>
                {editorReady && <TextEditor key={file.id} value={draft} isMarkdown={isMarkdown} onChange={setDraft} />}
              </Suspense>
            </section>
            <section aria-label="预览区域" className={`min-h-0 min-w-0 overflow-auto p-5 md:p-8 ${mode === 'edit' ? 'hidden' : ''}`}>
              {isMarkdown ? <div className="markdown-preview mx-auto max-w-3xl">
                <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
                  a: ({ children, href, title }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
                }}>{draft}</Markdown>
              </div> : <pre className="mx-auto max-w-4xl whitespace-pre-wrap break-words font-mono text-sm leading-7 text-zinc-700">{draft || '（空文件）'}</pre>}
            </section>
          </main>
          <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-zinc-200 px-6 py-2 text-[11px] text-zinc-400">
            <span>UTF-8 · {(byteLength / 1024).toFixed(1)} KB{byteLength > limit && <span className="ml-2 text-red-600">内容超过 1 MB，无法在线保存</span>}</span>
            <span>Ctrl / ⌘ + S 保存</span>
          </footer>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';

interface TextEditorProps {
  value: string;
  isMarkdown: boolean;
  onChange: (value: string) => void;
}

export default function TextEditor({ value, isMarkdown, onChange }: TextEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>();
  const changeHandler = useRef(onChange);
  const lineBreak = useRef('\n');
  changeHandler.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    lineBreak.current = value.includes('\r\n') ? '\r\n' : '\n';
    const view = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        basicSetup,
        ...(isMarkdown ? [markdown()] : []),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': '文件内容编辑器' }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.7' },
          '.cm-content': { padding: '16px 0' },
          '.cm-gutters': { backgroundColor: '#fafafa', color: '#a1a1aa', borderColor: '#e4e4e7' },
          '&.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            changeHandler.current(update.state.doc.sliceString(0, update.state.doc.length, lineBreak.current));
          }
        }),
      ],
    });
    editor.current = view;
    return () => { view.destroy(); editor.current = undefined; };
    // Content changes are synchronized below without recreating the editor.
  }, [isMarkdown]);

  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.sliceString(0, view.state.doc.length, lineBreak.current) !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="h-full min-h-0" />;
}

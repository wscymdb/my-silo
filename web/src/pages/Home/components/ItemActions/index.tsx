import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

interface Action {
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  href?: string;
  download?: boolean;
  destructive?: boolean;
}

interface ItemActionsProps {
  name: string;
  actions: Action[];
}

export default function ItemActions({ name, actions }: ItemActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusOnOpen = useRef(false);
  const menuId = useId();

  const cancelHide = () => clearTimeout(hideTimer.current);
  const close = () => {
    cancelHide();
    setOpen(false);
  };
  const show = (focus = false) => {
    cancelHide();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = actions.length * 32 + 8;
    setPosition({
      left: Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184)),
      top: rect.bottom + height + 6 <= window.innerHeight - 8
        ? rect.bottom + 6 : Math.max(8, rect.top - height - 6),
    });
    focusOnOpen.current = focus;
    if (focus && menuRef.current) {
      menuRef.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      focusOnOpen.current = false;
    }
    setOpen(true);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(close, 150);
  };

  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      focusOnOpen.current = false;
    }
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className="inline-flex" onMouseEnter={() => show()} onMouseLeave={scheduleHide}
      onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <button ref={triggerRef} type="button" title="更多操作" aria-label={`更多操作 ${name}`}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => show(true)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(true);
          } else if (event.key === 'Escape') close();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label={`${name} 的操作`}
          style={position} onMouseEnter={cancelHide} onMouseLeave={scheduleHide}
          onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}
          onKeyDown={event => {
            const entries = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const index = entries.indexOf(document.activeElement as HTMLElement);
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
              triggerRef.current?.focus();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
              entries[next]?.focus();
            } else if (event.key === 'Tab') close();
          }}
          className="fixed z-50 w-44 rounded-md border border-zinc-200 bg-white p-1 text-left shadow-lg">
          {actions.map(({ label, icon: Icon, onSelect, href, download, destructive }) => {
            const className = `flex h-8 w-full items-center gap-2 rounded px-2 text-xs outline-none ${destructive
              ? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
              : 'text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100'}`;
            const content = <><Icon className="h-3.5 w-3.5 shrink-0" />{label}</>;
            return href ? (
              <a key={label} role="menuitem" tabIndex={-1} href={href} download={download} className={className} onClick={close}>{content}</a>
            ) : (
              <button key={label} type="button" role="menuitem" tabIndex={-1} className={className}
                onClick={() => { close(); onSelect?.(); }}>{content}</button>
            );
          })}
        </div>, document.body,
      )}
    </div>
  );
}

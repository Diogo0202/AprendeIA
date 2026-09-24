import { CSSProperties, PointerEvent, useRef } from 'react';

export type NavigationDockItem = {
  id: string;
  label: string;
  glyph: string;
  active?: boolean;
  onSelect: () => void;
};

type NavigationDockProps = {
  ariaLabel: string;
  items: NavigationDockItem[];
  orientation?: 'horizontal' | 'vertical';
};

type DockStyle = CSSProperties & { '--dock-distance': number };

/** Amplia somente o glifo, mantendo rotulo e area clicavel estaveis. */
export function NavigationDock({
  ariaLabel,
  items,
  orientation = 'vertical',
}: NavigationDockProps) {
  const dockRef = useRef<HTMLElement>(null);

  function updateDistances(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return;
    const horizontal = orientation === 'horizontal';
    dockRef.current?.querySelectorAll<HTMLElement>('.app-dock-item').forEach((item) => {
      const bounds = item.getBoundingClientRect();
      const center = horizontal ? bounds.left + bounds.width / 2 : bounds.top + bounds.height / 2;
      const pointer = horizontal ? event.clientX : event.clientY;
      const size = Math.max(1, horizontal ? bounds.width : bounds.height);
      item.style.setProperty(
        '--dock-distance',
        String(Math.min(4, Math.abs(pointer - center) / size)),
      );
    });
  }

  function resetDistances() {
    dockRef.current?.querySelectorAll<HTMLElement>('.app-dock-item').forEach((item) => {
      item.style.setProperty('--dock-distance', '4');
    });
  }

  return (
    <nav
      ref={dockRef}
      className={`app-dock app-dock-${orientation}`}
      aria-label={ariaLabel}
      onPointerMove={updateDistances}
      onPointerLeave={resetDistances}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`app-dock-item ${item.active ? 'active' : ''}`}
          style={{ '--dock-distance': 4 } as DockStyle}
          onClick={item.onSelect}
          onFocus={(event) => event.currentTarget.style.setProperty('--dock-distance', '0')}
          onBlur={(event) => event.currentTarget.style.setProperty('--dock-distance', '4')}
          aria-current={item.active ? 'page' : undefined}
        >
          <span className="app-dock-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          <span className="app-dock-label">{item.label}</span>
          <span className="app-dock-tip" aria-hidden="true">
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}

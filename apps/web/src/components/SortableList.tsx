import { useRef, useState, type DragEvent, type ReactNode } from 'react';

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  renderRow: (item: T, state: RowState) => ReactNode;
  rowClassName?: (item: T, state: RowState) => string;
  className?: string;
  disabled?: boolean;
}

export interface RowState {
  index: number;
  dragging: boolean;
  drop: 'before' | 'after' | null;
  handleProps: {
    draggable: boolean;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onClick: (event: React.MouseEvent) => void;
  };
}

/** dataTransfer 里标记「这是站点行」的类型，侧栏分组树据此识别跨目录拖拽来源。 */
export const ITEM_DRAG_TYPE = 'application/x-purenav-item';

/**
 * Drag state for tables, where rows must stay `<tr>` and therefore cannot be wrapped
 * in the SortableList container. Rows opt in by spreading `rowProps` onto `<tr>`.
 *
 * `reorderEnabled` only gates drops inside the table. The handle stays draggable while
 * it is off, because dragging a row onto the sidebar tree moves it to another group
 * regardless of whether the current page holds a complete group.
 */
export function useRowDrag(
  ids: string[],
  onReorder: (ordered: string[]) => void,
  { reorderEnabled = true }: { reorderEnabled?: boolean } = {},
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);

  const reset = () => {
    setDragId(null);
    setDropTarget(null);
  };

  return {
    /** 当前拖拽中的行 id；跨组件（如侧栏分组树）据此判定拖拽来源。 */
    dragId,
    reset,
    start: (id: string) => (event: DragEvent<HTMLElement>) => {
      const row = event.currentTarget.closest('tr');
      if (row) {
        const rect = row.getBoundingClientRect();
        event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.setData(ITEM_DRAG_TYPE, id);
      setDragId(id);
    },
    end: reset,
    /** Spread onto <tr>. `extraClassName` keeps caller styling without clobbering drag state. */
    rowProps: (id: string, extraClassName?: string) => {
      const drop =
        reorderEnabled && dropTarget?.id === id && dragId !== id
          ? dropTarget.after
            ? 'after'
            : 'before'
          : null;
      return {
        className:
          [extraClassName, dragId === id ? 'sortable-dragging' : '', drop ? `drop-${drop}` : '']
            .filter(Boolean)
            .join(' ') || undefined,
        'data-sortable-item': id,
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!reorderEnabled || !dragId || dragId === id) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const after = event.clientY > rect.top + rect.height / 2;
          setDropTarget((current) => (current?.id === id && current.after === after ? current : { id, after }));
        },
        onDrop: () => {
          if (reorderEnabled && dragId && dropTarget && dragId !== dropTarget.id) {
            const next = ids.filter((value) => value !== dragId);
            const targetIndex = next.indexOf(dropTarget.id);
            if (targetIndex >= 0) {
              next.splice(dropTarget.after ? targetIndex + 1 : targetIndex, 0, dragId);
              onReorder(next);
            }
          }
          reset();
        },
      };
    },
  };
}

/**
 * Drag-and-drop reorder built on the native HTML5 API, so there is no dependency.
 *
 * The drag starts from a dedicated handle rather than the row itself: dragging the
 * whole row would fight text selection and make clickable rows feel unstable.
 * Keyboard users get the separate up/down buttons that callers keep alongside this.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderRow,
  rowClassName,
  className,
  disabled = false,
}: SortableListProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const ids = items.map(getId);

  const commit = (fromId: string, targetId: string, after: boolean) => {
    const next = ids.filter((id) => id !== fromId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0 || !next.length) return;
    next.splice(after ? targetIndex + 1 : targetIndex, 0, fromId);
    onReorder(next);
  };

  const handleDragStart = (id: string) => (event: DragEvent<HTMLElement>) => {
    const row = event.currentTarget.closest('[data-sortable-item]') as HTMLElement | null;
    if (row) {
      const rect = row.getBoundingClientRect();
      // Drag the whole row, not just the handle.
      event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
    }
    event.dataTransfer.effectAllowed = 'move';
    // Firefox refuses to start a drag without payload.
    event.dataTransfer.setData('text/plain', id);
    setDragId(id);
  };

  const endDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div
      ref={listRef}
      className={className}
      onDragOver={(event) => {
        if (dragId) event.preventDefault();
      }}
      onDragLeave={(event) => {
        // Ignore transitions between children; only clear when the pointer leaves the list.
        const next = event.relatedTarget as Node | null;
        if (!next || !listRef.current?.contains(next)) setDropTarget(null);
      }}
      onDrop={() => {
        if (dragId && dropTarget) commit(dragId, dropTarget.id, dropTarget.after);
        endDrag();
      }}
    >
      {items.map((item, index) => {
        const id = getId(item);
        const state: RowState = {
          index,
          dragging: dragId === id,
          drop: dropTarget?.id === id && dragId !== id ? (dropTarget.after ? 'after' : 'before') : null,
          handleProps: {
            draggable: !disabled,
            onDragStart: handleDragStart(id),
            onDragEnd: endDrag,
            onClick: (event) => event.stopPropagation(),
          },
        };

        const rowClass = [rowClassName?.(item, state), state.dragging ? 'sortable-dragging' : '', state.drop ? `drop-${state.drop}` : '']
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={id}
            data-sortable-item={id}
            className={rowClass || undefined}
            onDragOver={(event) => {
              if (!dragId || dragId === id) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              const rect = event.currentTarget.getBoundingClientRect();
              const after = event.clientY > rect.top + rect.height / 2;
              setDropTarget((current) =>
                current?.id === id && current.after === after ? current : { id, after },
              );
            }}
          >
            {renderRow(item, state)}
          </div>
        );
      })}
    </div>
  );
}

/** The grip itself. Kept out of the tab order: keyboard users get explicit move buttons. */
export function DragHandle({
  handleProps,
  disabled,
  title,
}: {
  handleProps: RowState['handleProps'];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <span
      className={disabled ? 'drag-handle drag-handle-off' : 'drag-handle'}
      aria-hidden="true"
      title={disabled ? undefined : (title ?? '拖拽调整顺序')}
      draggable={handleProps.draggable}
      onDragStart={handleProps.onDragStart}
      onDragEnd={handleProps.onDragEnd}
      onClick={handleProps.onClick}
    >
      ⠿
    </span>
  );
}

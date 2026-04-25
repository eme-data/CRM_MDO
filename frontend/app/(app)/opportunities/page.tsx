'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  DndContext, useDraggable, useDroppable,
  DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatEuro, stageLabel } from '@/lib/utils';

const STAGES = ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'];
const stageColor: Record<string, string> = {
  QUALIFICATION: 'border-slate-300',
  PROPOSITION: 'border-blue-300',
  NEGOCIATION: 'border-amber-300',
  GAGNE: 'border-emerald-300',
  PERDU: 'border-red-300',
};

export default function OpportunitiesPage() {
  const [kanban, setKanban] = useState<any[]>([]);
  const [activeOpp, setActiveOpp] = useState<any | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() { setKanban(await api.get('/opportunities/kanban')); }
  useEffect(() => { load(); }, []);

  function findOpp(id: string): any {
    for (const col of kanban) {
      const o = col.items.find((x: any) => x.id === id);
      if (o) return o;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveOpp(findOpp(String(e.active.id)));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveOpp(null);
    if (!e.over) return;
    const oppId = String(e.active.id);
    const targetStage = String(e.over.id);
    const opp = findOpp(oppId);
    if (!opp || opp.stage === targetStage) return;
    // Optimistic
    setKanban((prev) =>
      prev.map((col) => ({
        ...col,
        items:
          col.stage === opp.stage
            ? col.items.filter((x: any) => x.id !== oppId)
            : col.stage === targetStage
              ? [{ ...opp, stage: targetStage }, ...col.items]
              : col.items,
      })),
    );
    try {
      await api.patch('/opportunities/' + oppId, { stage: targetStage });
      load();
    } catch (err: any) {
      toast.error(err.message);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Opportunites</h1>
        <Link href="/opportunities/new" className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle</Link>
      </div>
      <p className="text-xs text-slate-500">Tip : faites glisser une carte d'une colonne a l'autre pour changer son etape.</p>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {kanban.map((col) => (
            <DroppableColumn key={col.stage} col={col} />
          ))}
        </div>
        <DragOverlay>
          {activeOpp ? <CardDraggable opp={activeOpp} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DroppableColumn({ col }: { col: any }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={
        'card border-t-4 p-3 transition-colors ' + stageColor[col.stage] +
        (isOver ? ' bg-mdo-50 dark:bg-mdo-900/20' : '')
      }
    >
      <div className="flex justify-between mb-2">
        <h3 className="font-semibold text-sm">{stageLabel[col.stage]}</h3>
        <span className="text-xs text-slate-500">{col.count}</span>
      </div>
      <div className="text-xs text-slate-500 mb-3">{formatEuro(col.totalAmount)}</div>
      <div className="space-y-2 min-h-[80px]">
        {col.items.map((o: any) => (
          <CardDraggable key={o.id} opp={o} />
        ))}
      </div>
    </div>
  );
}

function CardDraggable({ opp, dragging }: { opp: any; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : { opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={
        'block rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs cursor-grab ' +
        (dragging ? 'bg-white shadow-xl' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700')
      }
    >
      <div className="font-medium truncate">{opp.title}</div>
      <div className="text-slate-500 dark:text-slate-400 truncate">{opp.company?.name ?? ''}</div>
      <div className="mt-1 flex justify-between items-center">
        <span className="font-medium text-mdo-600">{formatEuro(opp.amountHt)}</span>
        <Link
          href={'/opportunities/' + opp.id}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-mdo-600 hover:underline"
        >
          Ouvrir
        </Link>
      </div>
    </div>
  );
}

import React, { useCallback } from 'react';
import CollapsibleSection from '../CollapsibleSection';

export default function UndoControlsSection({ emit, can_undo, can_rollback_street }) {
  const handleUndoAction = useCallback(() => {
    if (emit.undoAction && can_undo) emit.undoAction();
  }, [emit, can_undo]);

  const handleRollbackStreet = useCallback(() => {
    if (emit.rollbackStreet && can_rollback_street) emit.rollbackStreet();
  }, [emit, can_rollback_street]);

  return (
    <CollapsibleSection title="UNDO CONTROLS" defaultOpen={false}>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleUndoAction}
          disabled={!can_undo}
          className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 4.5h5a3 3 0 0 1 0 6h-2M1.5 4.5L4 2M1.5 4.5L4 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Undo Last Action
        </button>
        <button
          onClick={handleRollbackStreet}
          disabled={!can_rollback_street}
          className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 6h5a2 2 0 1 1 0 4H5M1.5 6L4 3.5M1.5 6L4 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Rollback Street
        </button>
      </div>
    </CollapsibleSection>
  );
}

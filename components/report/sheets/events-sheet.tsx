"use client";

import { useState } from "react";
import { Sheet, useCloseSheet } from "./sheet";
import { EventsSection, type EventView } from "./intervention-sheet";

/**
 * Procedural events on their own (spec §2.8a): events belong to the procedure, so a diagnostic study
 * with no intervention still records them. The same section the Intervention & devices sheet shows.
 */
export function EventsSheet({ procedureId, events, closeHref }: { procedureId: string; events: EventView[]; closeHref: string }) {
  const [dirty, setDirty] = useState(false);
  const close = useCloseSheet(closeHref, "edit-events", dirty);
  return (
    <Sheet
      title="Procedural events"
      closeHref={closeHref}
      returnFocusId="edit-events"
      dirty={dirty}
      footer={
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={close}>
          Done
        </button>
      }
    >
      <EventsSection procedureId={procedureId} events={events} onDirty={setDirty} />
    </Sheet>
  );
}

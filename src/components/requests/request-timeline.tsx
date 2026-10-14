import { Badge } from "@/components/ui/badge";
import { describeEvent, formatDateTime } from "@/lib/requests/format";
import { requestEventLabels } from "@/lib/requests/status";
import type { RequestEvent } from "@/lib/requests/types";
import { cn } from "@/lib/utils";

/** Audit timeline. Requesters only ever receive requester-visible events (RLS). */
export function RequestTimeline({ events }: { events: readonly RequestEvent[] }) {
  return (
    <ol className="flex flex-col gap-4 border-l pl-4">
      {events.map((event) => {
        const description = describeEvent(event);
        const internal = event.visibility === "internal";
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className={cn("absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full", internal ? "bg-muted-foreground" : "bg-brand")}
            />
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {requestEventLabels[event.eventType]}
              {internal ? <Badge variant="outline">Interna</Badge> : null}
            </p>
            {description ? (
              <p className={cn("text-sm text-muted-foreground", internal && "line-clamp-2 break-words")}>{description}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(event.createdAt)}
              {event.actorName ? ` · ${event.actorName}` : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

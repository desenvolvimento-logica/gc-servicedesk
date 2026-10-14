"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/requests/format";
import type { RequestEvent } from "@/lib/requests/types";
import { NOTE_MAX_LENGTH } from "@/lib/requests/workflow";
import { addInternalNote } from "@/server/requests/workflow-actions";

type InternalNotesProps = {
  requestId: string;
  notes: readonly RequestEvent[];
  /** Closed requests accept no new notes. */
  locked: boolean;
};

/** Staff-only notes. Never rendered for requesters (and never returned to them by the database). */
export function InternalNotes({ requestId, notes, locked }: InternalNotesProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return setError("Escreva a observação.");
    startTransition(async () => {
      const result = await addInternalNote(requestId, text);
      if (result.ok) {
        setText("");
        setError(null);
        toast.success("Observação adicionada.");
      } else {
        setError(result.fieldErrors?.text?.[0] ?? null);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma observação interna.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{note.actorName ?? "—"}</span> · {formatDateTime(note.createdAt)}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{note.details.text}</p>
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <Label htmlFor="internal-note">Nova observação</Label>
          <Textarea
            id="internal-note"
            rows={3}
            value={text}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={!!error}
            aria-describedby="internal-note-message"
            placeholder="Visível apenas para a equipe da Gestão de Cadastro."
          />
          {error ? (
            <p id="internal-note-message" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="outline" className="self-end" disabled={pending}>
            <Plus aria-hidden />
            {pending ? "Salvando..." : "Adicionar observação"}
          </Button>
        </form>
      )}
    </div>
  );
}

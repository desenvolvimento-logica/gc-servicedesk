"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/requests/format";
import type { RequestEvent } from "@/lib/requests/types";
import { NOTE_MAX_LENGTH } from "@/lib/requests/workflow";
import { addComment } from "@/server/requests/workflow-actions";

type RequestCommentsProps = {
  requestId: string;
  /**
   * Comments, oldest first. For staff it also holds legacy internal notes,
   * which the database never returns to requesters.
   */
  comments: readonly RequestEvent[];
  /** Closed requests accept no new comments. */
  locked: boolean;
};

/** "Observações" between the requester and the Gestão de Cadastro team. */
export function RequestComments({ requestId, comments, locked }: RequestCommentsProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return setError("Escreva a observação.");
    startTransition(async () => {
      const result = await addComment(requestId, text);
      if (result.ok) {
        setText("");
        setError(null);
        toast.success("Observação enviada.");
      } else {
        setError(result.fieldErrors?.text?.[0] ?? null);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma observação.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-muted/60 p-3">
              <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.actorName ?? "—"}</span> ·{" "}
                {formatDateTime(comment.createdAt)}
                {comment.visibility === "internal" ? (
                  <Badge variant="outline" className="ml-1">
                    Interna
                  </Badge>
                ) : null}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{comment.details.text}</p>
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <Label htmlFor="request-comment">Nova observação</Label>
          <Textarea
            id="request-comment"
            rows={3}
            value={text}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={!!error}
            aria-describedby="request-comment-message"
            placeholder="Visível para o solicitante e para a equipe da Gestão de Cadastro."
          />
          {error ? (
            <p id="request-comment-message" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="outline" className="self-end" disabled={pending}>
            <Send aria-hidden />
            {pending ? "Enviando..." : "Enviar observação"}
          </Button>
        </form>
      )}
    </div>
  );
}

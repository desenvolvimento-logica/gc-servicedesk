"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { MicrosoftLogo } from "@/components/brand/microsoft-logo";
import { Button } from "@/components/ui/button";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      className="h-14 w-full justify-between px-5 text-base font-semibold"
      disabled={pending}
      aria-busy={pending}
    >
      <MicrosoftLogo className="size-6" />
      {pending ? "Redirecionando…" : "Entrar com Microsoft"}
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ChevronRight aria-hidden />}
    </Button>
  );
}

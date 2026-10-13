import { ChevronRight, TriangleAlert } from "lucide-react";

import { MicrosoftLogo } from "@/components/brand/microsoft-logo";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { signInWithMicrosoft } from "@/server/auth/actions";

import { SubmitButton } from "./submit-button";

const errorMessages: Record<string, string> = {
  signin: "Não foi possível iniciar o login com a Microsoft. Tente novamente.",
  callback: "O login não foi concluído. Tente novamente; se o problema continuar, procure o administrador.",
};

type SignInFormProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
};

export async function SignInForm({ searchParams }: SignInFormProps) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? errorMessages[params.error] : undefined;

  return (
    <form action={signInWithMicrosoft} className="space-y-3">
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-status-danger-soft p-3 text-sm text-status-danger">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <SubmitButton />
    </form>
  );
}

/** Placeholder with the same footprint while search params resolve. */
export function SignInFormFallback() {
  return (
    <Button size="lg" className="h-14 w-full justify-between px-5 text-base font-semibold" disabled>
      <MicrosoftLogo className="size-6" />
      Entrar com Microsoft
      <ChevronRight aria-hidden />
    </Button>
  );
}

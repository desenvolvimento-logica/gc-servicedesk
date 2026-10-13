"use client";

import { ChevronDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/auth/actions";

import { useViewer } from "./viewer-context";
import { initials, roleLabel } from "./viewer-format";

export function UserMenu() {
  const viewer = useViewer();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg p-1 pr-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar className="size-10">
          <AvatarFallback className="bg-brand-ink text-sm font-semibold text-white">
            {initials(viewer.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-48 truncate text-sm font-semibold">{viewer.name}</span>
          <span className="block max-w-48 truncate text-xs text-muted-foreground">
            {viewer.department?.name ?? roleLabel(viewer)}
          </span>
        </span>
        <ChevronDown aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
        <span className="sr-only">Abrir menu do usuário</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-semibold text-foreground">{viewer.name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{viewer.email}</p>
          <p className="text-xs font-normal text-muted-foreground">{roleLabel(viewer)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

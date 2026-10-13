"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo, BrandMark } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { isNavItemActive, navIcons, type NavItem } from "./navigation";

type AppSidebarProps = {
  items: readonly NavItem[];
};

export function AppSidebar({ items }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-(--app-header-height) shrink-0 justify-center gap-1.5 bg-brand-ink px-5 py-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <Link href="/" aria-label="Ir para o início">
          <BrandLogo tone="on-dark" className="w-28 group-data-[collapsible=icon]:hidden" priority />
          <BrandMark className="hidden group-data-[collapsible=icon]:block" />
        </Link>
        <div className="group-data-[collapsible=icon]:hidden">
          <p className="text-base leading-tight font-semibold text-white">
            GC Service <span className="text-brand">Desk</span>
          </p>
          <p className="text-xs text-white/70">Gestão de Cadastro</p>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const active = isNavItemActive(item.href, pathname, items);
                const Icon = navIcons[item.icon];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      size="lg"
                      tooltip={item.title}
                      className="relative h-11 font-medium group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:before:hidden data-[active=true]:font-semibold data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:rounded-full data-[active=true]:before:bg-brand"
                    >
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
                        <Icon aria-hidden className={active ? "text-brand-ink" : "text-muted-foreground"} />
                        <span className="group-data-[collapsible=icon]:sr-only">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-5 pb-6 group-data-[collapsible=icon]:hidden">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pessoas, processos e informações para um ecossistema contábil mais simples.
        </p>
        <span aria-hidden className="h-1 w-10 rounded-full bg-brand" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

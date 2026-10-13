import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col">
      <div className="space-y-2 border-b bg-card px-4 py-5 md:px-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

import { Skeleton } from "./ui/skeleton";

/** Loading shell matching Portal light sidebar + gray canvas. */
export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-[#F9F9F9]">
      <div className="w-[240px] border-r border-[#E8E6E6] bg-white flex flex-col">
        <div className="h-14 bg-primary flex items-center gap-3 px-4">
          <Skeleton className="h-8 w-8 rounded-md bg-white/40" />
          <Skeleton className="h-4 w-24 bg-white/40" />
        </div>
        <div className="space-y-2 p-3 flex-1">
          <Skeleton className="h-3 w-16 mx-2" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-[#EBE8E8] bg-white px-4 flex items-center">
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-10 w-56 rounded-lg" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

// DEPRECATED: This page previously contained mock data and is not wired to real APIs
// TODO: Wire to trpc.jobSheets.list with search/filter capabilities
export default function SearchPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Search & Archive</h1>
          <p className="text-muted-foreground mt-2">
            Advanced search across all audited documents
          </p>
        </div>

        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <AlertCircle className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-2xl font-semibold">Search Coming Soon</h2>
            <p className="text-muted-foreground max-w-md">
              Advanced search functionality is currently in development. 
              In the meantime, use the Upload and Audit Results pages to access your documents.
            </p>
            <div className="flex gap-3 mt-4">
              <Link href="/upload">
                <Button variant="default">Go to Upload</Button>
              </Link>
              <Link href="/audits">
                <Button variant="outline">View Audit Results</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

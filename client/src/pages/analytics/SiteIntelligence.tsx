import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Map, Navigation, Building2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Mock Data for Sites
const sites = [
  { id: 1, name: "London HQ", region: "South", score: 96, status: "Operational", defects: 12 },
  { id: 2, name: "Manchester Branch", region: "North", score: 92, status: "Operational", defects: 24 },
  { id: 3, name: "Leeds Hub", region: "North", score: 88, status: "Warning", defects: 45 },
  { id: 4, name: "Birmingham Depot", region: "Midlands", score: 94, status: "Operational", defects: 18 },
  { id: 5, name: "Glasgow Center", region: "Scotland", score: 85, status: "Critical", defects: 56 },
];

export default function SiteIntelligence() {
  return (
    <AnalyticsLayout 
      title="Site Intelligence" 
      description="Geospatial performance analysis and regional benchmarks."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* Map View Placeholder */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-5 h-5" />
              Geospatial Performance Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] bg-muted/20 rounded-lg flex items-center justify-center border-2 border-dashed">
              <div className="text-center">
                <Map className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground font-medium">Interactive Map Component</p>
                <p className="text-xs text-muted-foreground mt-1">
                  (Visualizes site locations with color-coded performance markers)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Site List */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Regional Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sites.map((site) => (
                <div key={site.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      site.status === "Critical" ? "bg-red-100 text-red-600" :
                      site.status === "Warning" ? "bg-orange-100 text-orange-600" :
                      "bg-green-100 text-green-600"
                    }`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{site.name}</h4>
                      <p className="text-xs text-muted-foreground">{site.region}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm">{site.score}%</div>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {site.defects} Defects
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-800 flex items-center gap-2">
                <Navigation className="w-5 h-5" />
                Optimization Route
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-blue-700 mb-4">
                AI suggests prioritizing visits to <strong>Glasgow Center</strong> and <strong>Leeds Hub</strong> based on recent defect spikes.
              </p>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Plan Site Visits
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AnalyticsLayout>
  );
}

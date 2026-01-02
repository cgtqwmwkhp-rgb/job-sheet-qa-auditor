import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, ChevronDown, Download, Filter, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";

// Mock Data
const searchResults = [
  {
    id: "JS-2024-045",
    technician: "John Doe",
    site: "London HQ",
    date: "2024-01-18",
    status: "passed",
    score: "A",
    type: "Maintenance",
  },
  {
    id: "JS-2024-044",
    technician: "Sarah Smith",
    site: "Manchester Branch",
    date: "2024-01-18",
    status: "failed",
    score: "C",
    type: "Installation",
  },
  {
    id: "JS-2024-043",
    technician: "Mike Johnson",
    site: "Leeds Depot",
    date: "2024-01-17",
    status: "passed",
    score: "B",
    type: "Repair",
  },
  {
    id: "JS-2024-042",
    technician: "David Brown",
    site: "London HQ",
    date: "2024-01-17",
    status: "passed",
    score: "A",
    type: "Maintenance",
  },
  {
    id: "JS-2024-041",
    technician: "Emily Davis",
    site: "Birmingham Hub",
    date: "2024-01-16",
    status: "failed",
    score: "D",
    type: "Installation",
  },
];

export default function SearchPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Search & Archive</h1>
          <p className="text-muted-foreground mt-1">
            Advanced search across all processed job sheets.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Left Panel: Filters */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Filters</CardTitle>
                <Button variant="ghost" size="sm" className="h-8 text-xs">Reset</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="grid gap-2">
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    Last 7 Days
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="status-passed" />
                    <Label htmlFor="status-passed" className="font-normal">Passed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="status-failed" />
                    <Label htmlFor="status-failed" className="font-normal">Failed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="status-review" />
                    <Label htmlFor="status-review" className="font-normal">In Review</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Job Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Site / Location</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    <SelectItem value="london">London HQ</SelectItem>
                    <SelectItem value="manchester">Manchester</SelectItem>
                    <SelectItem value="leeds">Leeds</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Score Range</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="score-a" /> <Label htmlFor="score-a">A</Label>
                  <Checkbox id="score-b" /> <Label htmlFor="score-b">B</Label>
                  <Checkbox id="score-c" /> <Label htmlFor="score-c">C</Label>
                  <Checkbox id="score-d" /> <Label htmlFor="score-d">D</Label>
                  <Checkbox id="score-f" /> <Label htmlFor="score-f">F</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel: Results */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by Job ID, Technician Name, or Serial Number..." 
                  className="pl-9 h-10"
                />
              </div>
              <Button variant="outline">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Advanced
              </Button>
              <Button>Search</Button>
            </div>

            {/* Results Table */}
            <Card>
              <CardHeader className="py-4 px-6 border-b flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Results</CardTitle>
                  <Badge variant="secondary">1,248 found</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sort by:</span>
                  <Button variant="ghost" size="sm" className="h-8">
                    Date <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8">
                    <Download className="w-3 h-3 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Job ID</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((item) => (
                      <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-mono font-medium text-primary">
                          <Link href={`/audits?id=${item.id}`}>{item.id}</Link>
                        </TableCell>
                        <TableCell>{item.technician}</TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell className="text-muted-foreground">{item.date}</TableCell>
                        <TableCell className="text-muted-foreground">{item.site}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={item.status === 'passed' ? 'default' : 'destructive'}
                            className="uppercase text-[10px]"
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {item.score}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-4 border-t flex items-center justify-center">
                  <Button variant="ghost" size="sm">Load More Results</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

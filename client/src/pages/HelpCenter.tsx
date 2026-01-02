import React, { useState } from "react";
import { 
  Search, 
  Book, 
  FileText, 
  HelpCircle, 
  Lightbulb, 
  ChevronRight, 
  PlayCircle,
  Info,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  BrainCircuit,
  BarChart3,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          How can we help you today?
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Explore our knowledge base for guides, FAQs, and best practices to get the most out of the Job Sheet QA Auditor.
        </p>
        
        <div className="max-w-xl mx-auto relative mt-6">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="Search for articles, guides, or questions..." 
            className="pl-10 h-12 text-lg shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 p-1 bg-muted/50 backdrop-blur-sm">
          <TabsTrigger value="overview" className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Info className="mr-2 h-4 w-4" /> System Overview
          </TabsTrigger>
          <TabsTrigger value="guides" className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Book className="mr-2 h-4 w-4" /> Interactive Guides
          </TabsTrigger>
          <TabsTrigger value="faqs" className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <HelpCircle className="mr-2 h-4 w-4" /> FAQs
          </TabsTrigger>
          <TabsTrigger value="best-practices" className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Lightbulb className="mr-2 h-4 w-4" /> Best Practices
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-8 space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                  <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>The "Why" & "How"</CardTitle>
                <CardDescription>Understanding the core purpose of the QA Auditor.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Our system automates the review of job sheets to ensure compliance, reduce return visits, and improve first-time fix rates. It uses advanced OCR and AI to validate every field against the Gold Standard Spec.
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Gold Standard Spec</CardTitle>
                <CardDescription>The rules engine powering our validation.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Learn how the "Gold Standard" defines the perfect job sheet. This layered rule set checks for mandatory fields, evidence quality, and compliance with client-specific requirements.
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
                  <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Workflow Engine</CardTitle>
                <CardDescription>From upload to approval or dispute.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Discover the lifecycle of a job sheet: Ingestion → OCR Extraction → Rule Validation → Scoring → Technician Feedback → Dispute/Approval.
              </CardContent>
            </Card>
          </div>

          <Card className="bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle>Platform Architecture</CardTitle>
              <CardDescription>A high-level view of how the pieces fit together.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative h-48 bg-background rounded-lg border flex items-center justify-center p-4">
                <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                  <div className="p-4 border rounded bg-card shadow-sm flex flex-col items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <span>PDF Upload</span>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                  <div className="p-4 border rounded bg-card shadow-sm flex flex-col items-center gap-2">
                    <BrainCircuit className="h-5 w-5" />
                    <span>OCR Engine</span>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                  <div className="p-4 border rounded bg-card shadow-sm flex flex-col items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    <span>AI Validator</span>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                  <div className="p-4 border rounded bg-card shadow-sm flex flex-col items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>Analytics</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guides Tab */}
        <TabsContent value="guides" className="mt-8">
          <div className="grid gap-4">
            {[
              { title: "Uploading Job Sheets", desc: "Step-by-step guide to single and batch uploads.", time: "2 min read" },
              { title: "Handling Disputes", desc: "How to review and resolve engineer disputes effectively.", time: "4 min read" },
              { title: "Configuring AI Personas", desc: "Adjusting the strictness and tone of the AI auditor.", time: "3 min read" },
              { title: "Understanding Analytics", desc: "Deep dive into First Fix Rates and Defect Analysis.", time: "5 min read" },
              { title: "Managing Users & Roles", desc: "Adding technicians and assigning permissions.", time: "3 min read" },
            ].map((guide, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Book className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{guide.title}</h3>
                    <p className="text-sm text-muted-foreground">{guide.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="secondary">{guide.time}</Badge>
                  <Button variant="ghost" size="icon">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Common questions about scoring, AI, and workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How is the "First Fix Rate" calculated?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    The First Fix Rate is calculated by analyzing the percentage of jobs that do not require a return visit within a 30-day window. We track asset IDs and correlate them with visit dates to identify repeat attendances.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>What happens if the AI misreads a handwritten field?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    If the confidence score for a field is low, the system flags it for manual review in the "Hold Queue". A QA Lead can then verify the value. If it's a persistent issue, engineers can raise a dispute which you can resolve in the Dispute Management portal.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>Can I customize the "Gold Standard" rules?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes. Navigate to the "Spec Management" page to adjust validation rules. You can define mandatory fields, allowed value ranges, and specific evidence requirements for different job types.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>How does the "Deep Note Analysis" work?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    We use a Large Language Model (LLM) to analyze the semantic content of engineer notes. We score them based on Clarity (is it understandable?), Completeness (does it cover the work done?), and Sentiment (is it professional?).
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Best Practices Tab */}
        <TabsContent value="best-practices" className="mt-8">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <CardTitle className="text-green-700 dark:text-green-300">For Engineers</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold text-green-600">•</span>
                    <span>Take clear, well-lit photos of the job sheet. Avoid shadows and blur.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-green-600">•</span>
                    <span>Write legibly in block capitals for critical fields like Asset IDs.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-green-600">•</span>
                    <span>Ensure detailed notes explaining <strong>what</strong> was done and <strong>why</strong>.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-green-600">•</span>
                    <span>Capture evidence photos for every replaced part.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-blue-700 dark:text-blue-300">For QA Leads</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span>Review the "Hold Queue" daily to prevent backlogs.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span>Use "First Fix Analysis" to identify training needs for specific engineers.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span>Adjust AI Persona strictness gradually—start lenient, then tighten.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span>Provide constructive feedback in dispute resolutions.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 p-4 rounded-lg border bg-card flex gap-4 items-start">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <h4 className="font-semibold">Common Pitfalls to Avoid</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Avoid "pencil whipping" checks—the AI looks for unique patterns in checkmarks. 
                Do not reuse photos from previous jobs; the system detects duplicate image hashes.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

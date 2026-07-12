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
  ArrowRight,
  Gauge,
  Scale,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight text-[#333030]">
          How can we help you today?
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Explore our knowledge base for guides, FAQs, and best practices to get
          the most out of the Job Sheet QA Auditor.
        </p>

        <div className="max-w-xl mx-auto relative mt-6">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search for articles, guides, or questions..."
            className="pl-10 h-12 text-lg shadow-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-14 p-1 bg-muted/50 backdrop-blur-sm">
          <TabsTrigger
            value="overview"
            className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Info className="mr-2 h-4 w-4" /> System Overview
          </TabsTrigger>
          <TabsTrigger
            value="guides"
            className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Book className="mr-2 h-4 w-4" /> Interactive Guides
          </TabsTrigger>
          <TabsTrigger
            value="faqs"
            className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <HelpCircle className="mr-2 h-4 w-4" /> FAQs
          </TabsTrigger>
          <TabsTrigger
            value="best-practices"
            className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Lightbulb className="mr-2 h-4 w-4" /> Best Practices
          </TabsTrigger>
          <TabsTrigger
            value="policies"
            className="h-12 text-base data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Scale className="mr-2 h-4 w-4" /> Policies &amp; Standards
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-8 space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-[rgba(190,218,65,0.15)] flex items-center justify-center mb-2">
                  <ShieldCheck className="h-6 w-6 text-[#333030]" />
                </div>
                <CardTitle>The "Why" & "How"</CardTitle>
                <CardDescription>
                  Understanding the core purpose of the QA Auditor.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Our system automates the review of job sheets to ensure
                compliance, reduce return visits, and improve first-time fix
                rates. It uses advanced OCR and AI to validate every field
                against the Gold Standard Spec.
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Gold Standard Spec</CardTitle>
                <CardDescription>
                  The rules engine powering our validation.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Learn how the "Gold Standard" defines the perfect job sheet.
                This layered rule set checks for mandatory fields, evidence
                quality, and compliance with client-specific requirements.
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-primary/10">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
                  <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Workflow Engine</CardTitle>
                <CardDescription>
                  From upload to approval or dispute.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Discover the lifecycle of a job sheet: Ingestion → OCR
                Extraction → Rule Validation → Scoring → Technician Feedback →
                Dispute/Approval.
              </CardContent>
            </Card>
          </div>

          <Card className="bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle>Platform Architecture</CardTitle>
              <CardDescription>
                A high-level view of how the pieces fit together.
              </CardDescription>
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
              {
                title: "Uploading Job Sheets",
                desc: "Step-by-step guide to single and batch uploads.",
                time: "2 min read",
                action: "/upload",
                actionLabel: "Go to Upload",
              },
              {
                title: "Handling Disputes",
                desc: "How to review and resolve engineer disputes effectively.",
                time: "4 min read",
                action: "/disputes",
                actionLabel: "View Disputes",
              },
              {
                title: "Configuring AI Personas",
                desc: "Adjusting the strictness and tone of the AI auditor.",
                time: "3 min read",
                action: "/settings",
                actionLabel: "Configure AI",
              },
              {
                title: "Understanding Analytics",
                desc: "Deep dive into First Fix Rates and Defect Analysis.",
                time: "5 min read",
                action: "/analytics",
                actionLabel: "Open Analytics",
              },
              {
                title: "Managing Users & Roles",
                desc: "Adding technicians and assigning permissions.",
                time: "3 min read",
                action: "/users",
                actionLabel: "Manage Users",
              },
            ].map((guide, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center gap-4 cursor-pointer flex-1">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Book className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {guide.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {guide.desc}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="secondary">{guide.time}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden group-hover:flex animate-in fade-in"
                    onClick={e => {
                      e.stopPropagation();
                      setLocation(guide.action);
                    }}
                  >
                    {guide.actionLabel}
                  </Button>
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
              <CardDescription>
                Common questions about scoring, AI, and workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    How is the "First Fix Rate" calculated?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    The First Fix Rate is calculated by analyzing the percentage
                    of jobs that do not require a return visit within a 30-day
                    window. We track asset IDs and correlate them with visit
                    dates to identify repeat attendances.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>
                    What happens if the AI misreads a handwritten field?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    If the confidence score for a field is low, the system flags
                    it for manual review in the "Hold Queue". A QA Lead can then
                    verify the value. If it's a persistent issue, engineers can
                    raise a dispute which you can resolve in the Dispute
                    Management portal.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    Can I customize the "Gold Standard" rules?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes. Navigate to the "Spec Management" page to adjust
                    validation rules. You can define mandatory fields, allowed
                    value ranges, and specific evidence requirements for
                    different job types.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>
                    How does the "Deep Note Analysis" work?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    We use a Large Language Model (LLM) to analyze the semantic
                    content of engineer notes. We score them based on Clarity
                    (is it understandable?), Completeness (does it cover the
                    work done?), and Sentiment (is it professional?).
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Best Practices Tab */}
        <TabsContent value="best-practices" className="mt-8">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-[#F9F9F9] border-[#EBE8E8]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-[#333030]">
                    For Engineers
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Take clear, well-lit photos of the job sheet. Avoid
                      shadows and blur.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Write legibly in block capitals for critical fields like
                      Asset IDs.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Ensure detailed notes explaining <strong>what</strong> was
                      done and <strong>why</strong>.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Capture evidence photos for every replaced part.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-[#F9F9F9] border-[#EBE8E8]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle className="text-[#333030]">For QA Leads</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Review the "Hold Queue" daily to prevent backlogs.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Use "First Fix Analysis" to identify training needs for
                      specific engineers.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Adjust AI Persona strictness gradually—start lenient, then
                      tighten.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">•</span>
                    <span>
                      Provide constructive feedback in dispute resolutions.
                    </span>
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
                Avoid "pencil whipping" checks—the AI looks for unique patterns
                in checkmarks. Do not reuse photos from previous jobs; the
                system detects duplicate image hashes.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Policies & Standards Tab */}
        <TabsContent value="policies" className="mt-8 space-y-6">
          {/* Doc Quality % vs Extract Confidence */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>Doc Quality % vs Extract Confidence</CardTitle>
                  <CardDescription>
                    Two different scores — one for the document, one for the OCR
                    read.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Doc Quality %
                  </h4>
                  <p>
                    Starts at <strong>100 %</strong> and drops when the auditor
                    finds documentation problems — missing fields, inconsistent
                    values, or incomplete notes. Each rule violation deducts
                    points based on its fail class (Major penalties are heavier
                    than Minor).
                  </p>
                  <p>
                    Think of it as a <em>paperwork score</em>: "How complete and
                    correct is this job sheet?"
                  </p>
                </div>
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-purple-600" />
                    Extract Confidence %
                  </h4>
                  <p>
                    How sure the OCR engine is that it read a particular field
                    correctly. A field showing{" "}
                    <span className="font-mono text-xs bg-muted px-1 rounded">
                      92% Extract conf.
                    </span>{" "}
                    means the system is 92 % confident in the value it extracted
                    from the handwriting or print.
                  </p>
                  <p>
                    Low Extract Confidence does <strong>not</strong> deduct from
                    Doc Quality — it instead flags the field for human review in
                    the Hold Queue.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start rounded-lg bg-muted/50 p-3">
                <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                <p>
                  <strong>In short:</strong> Doc Quality measures the{" "}
                  <em>engineer's</em> paperwork. Extract Confidence measures the{" "}
                  <em>system's</em> ability to read it.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tyre Compliance */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Gauge className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle>Tyre Compliance — Tread &amp; PSI</CardTitle>
                  <CardDescription>
                    Minimum tread depth and inflation bands for trailer tyres.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold text-foreground">
                  Tread Depth (TYRE-C010)
                </h4>
                <p>
                  Every recorded tread position (OSF, NSF, OSR, NSR, plus 3rd-
                  axle variants) must be{" "}
                  <strong className="text-foreground">≥ 2.0 mm</strong>. A
                  reading below 2 mm triggers an S1 Major finding and an
                  immediate fail of the audit.
                </p>
                <p>
                  Exactly 2.0 mm is a <em>pass</em> — the rule is "greater than
                  or equal to."
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-semibold text-foreground">
                  PSI / Inflation Bands (TYRE-C020)
                </h4>
                <p>
                  When the system reads both a tyre size and a PSI value, it
                  checks the pressure against the manufacturer-recommended cold-
                  inflation band for that size. If the size is unknown or
                  missing, no PSI fail is raised (informational only).
                </p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left font-medium px-4 py-2">
                          Tyre Size
                        </th>
                        <th className="text-left font-medium px-4 py-2">
                          Acceptable PSI
                        </th>
                        <th className="text-left font-medium px-4 py-2">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="px-4 py-2 font-mono">195/50R13C</td>
                        <td className="px-4 py-2">90 – 95 PSI</td>
                        <td className="px-4 py-2 text-xs">
                          Wanda WR068, ETD (6.5 bar max)
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-4 py-2 font-mono">155/70R12C</td>
                        <td className="px-4 py-2">90 – 95 PSI</td>
                        <td className="px-4 py-2 text-xs">
                          Wanda WR068, Kenda, ETD (6.2–6.5 bar)
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-4 py-2 font-mono">185/70R13C</td>
                        <td className="px-4 py-2">83 – 87 PSI</td>
                        <td className="px-4 py-2 text-xs">
                          Trident Towing, Kenda KR103 (6.0 bar max)
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono">195/55R10C</td>
                        <td className="px-4 py-2">87 – 91 PSI</td>
                        <td className="px-4 py-2 text-xs">
                          Wanda WR301/068 (6.25 bar max)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs">
                  Sizes not listed above are treated as informational — PSI is
                  recorded but no pass/fail is issued.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Major vs Minor Audit Policy */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <CardTitle>Major vs Minor Audit Policy</CardTitle>
                  <CardDescription>
                    How fail classes drive the pass/fail decision.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-2">
                  <Badge variant="destructive">Major</Badge>
                  <p>
                    A single Major finding causes an{" "}
                    <strong className="text-foreground">immediate fail</strong>{" "}
                    of the entire job card, regardless of the Doc Quality score.
                    Safety-critical rules (e.g. missing safety signature, unsafe
                    tread depth) are always Major and cannot be downgraded by
                    non-admin users.
                  </p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-2">
                  <Badge variant="secondary">Minor</Badge>
                  <p>
                    Minor findings deduct points from Doc Quality but{" "}
                    <strong className="text-foreground">
                      never force a fail on their own
                    </strong>
                    . They are used for coaching — for example, a missing
                    secondary note or an incomplete reading that doesn't affect
                    safety.
                  </p>
                </div>
                <div className="rounded-lg border p-4 space-y-2">
                  <Badge variant="outline">Informational</Badge>
                  <p>
                    Informational items are logged for reference but have{" "}
                    <strong className="text-foreground">
                      no impact on scoring or the pass/fail outcome
                    </strong>
                    . Use them for context the auditor should see without
                    penalising the engineer.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start rounded-lg bg-muted/50 p-3">
                <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                <p>
                  Admins can change a rule's fail class in{" "}
                  <strong>Settings → Audit Policy</strong>. Changes apply to new
                  and reprocessed audits only — existing results keep their
                  original decision.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* VOR Documentation Consistency */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>VOR Documentation Consistency</CardTitle>
                  <CardDescription>
                    What "PASS" means when the system checks VOR paperwork.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">VOR</strong> (Vehicle Off
                Road) is a signal extracted from the job sheet indicating the
                asset could not be returned to service. When the system detects
                a VOR flag, it cross-checks the surrounding documentation for
                consistency:
              </p>
              <ul className="space-y-2 ml-1">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>
                    <strong>"Safe To Use"</strong> should align — if VOR is
                    flagged, "Asset Safe To Use" should typically say No.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>
                    <strong>"All Works Completed"</strong> is expected to be No
                    when an asset is left VOR, since outstanding work remains.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>
                    <strong>"Parts Still Required"</strong> or a return-visit
                    flag should usually accompany a VOR.
                  </span>
                </li>
              </ul>
              <div className="grid gap-4 md:grid-cols-2 mt-2">
                <div className="rounded-lg border border-green-200 bg-green-50/50 dark:bg-green-950/20 p-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <strong>PASS · docs</strong> = good documentation
                  </div>
                  <p>
                    All VOR-related fields tell a consistent story. The
                    paperwork matches reality — no contradictions between VOR
                    status, safety flags, and completion fields. This is not an
                    asset pass.
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <strong>FAIL · docs</strong> = contradictory documentation
                  </div>
                  <p>
                    The system found a mismatch — for example, VOR flagged but
                    "Safe To Use = Yes", or "All Works Completed = Yes" despite
                    the asset being off road. This needs review.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

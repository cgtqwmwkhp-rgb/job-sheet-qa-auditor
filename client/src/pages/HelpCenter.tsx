import React, { useMemo, useState } from "react";
import {
  Search,
  Book,
  FileText,
  HelpCircle,
  Lightbulb,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  BrainCircuit,
  BarChart3,
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
import DashboardLayout from "@/components/DashboardLayout";

const HELP_CATEGORIES = [
  {
    id: "overview",
    label: "System Overview",
    icon: Info,
    description: "Purpose, architecture, and workflow",
  },
  {
    id: "guides",
    label: "Interactive Guides",
    icon: Book,
    description: "Step-by-step walkthroughs",
  },
  {
    id: "faqs",
    label: "FAQs",
    icon: HelpCircle,
    description: "Scoring, AI, and workflows",
  },
  {
    id: "best-practices",
    label: "Best Practices",
    icon: Lightbulb,
    description: "Tips for engineers and QA leads",
  },
  {
    id: "policies",
    label: "Policies & Standards",
    icon: Scale,
    description: "Doc quality, tyres, audit policy",
  },
] as const;

/** PX-095 — article-level search corpus (not category labels alone) */
const SEARCHABLE_CONTENT = [
  {
    tab: "overview",
    title: "The Why & How",
    text: "Gold Standard Spec OCR AI Validator workflow ingestion scoring compliance return visits first-time fix rates",
  },
  {
    tab: "overview",
    title: "Gold Standard Spec",
    text: "rules engine mandatory fields evidence quality client-specific requirements layered rule set",
  },
  {
    tab: "overview",
    title: "Workflow Engine",
    text: "upload approval dispute lifecycle ingestion OCR extraction rule validation scoring technician feedback",
  },
  {
    tab: "overview",
    title: "Platform Architecture",
    text: "PDF upload OCR engine AI validator analytics pipeline architecture",
  },
  {
    tab: "guides",
    title: "Uploading Job Sheets",
    text: "upload disputes AI persona analytics users roles single batch uploads",
  },
  {
    tab: "guides",
    title: "Handling Disputes",
    text: "review resolve engineer disputes effectively",
  },
  {
    tab: "guides",
    title: "Configuring AI Personas",
    text: "advisory voice strictness tone focus audit policy fail law",
  },
  {
    tab: "guides",
    title: "Understanding Analytics",
    text: "first fix rates defect analysis scorecards",
  },
  {
    tab: "guides",
    title: "Managing Users & Roles",
    text: "technicians permissions admin qa_lead",
  },
  {
    tab: "faqs",
    title: "FAQs",
    text: "first fix rate handwritten OCR dispute gold standard deep note analysis scoring confidence",
  },
  {
    tab: "best-practices",
    title: "Best Practices",
    text: "engineers photos notes QA leads hold queue coaching disputes sharp photos glare shadows",
  },
  {
    tab: "policies",
    title: "Policies & Standards",
    text: "doc quality extract confidence tyre tread PSI major minor VOR documentation policy",
  },
];

const GUIDES = [
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
    desc: "Set org advisory voice (strictness, tone, focus). Separate from Audit Policy fail law.",
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
];

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [, setLocation] = useLocation();

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const articleHits = useMemo(() => {
    if (!normalizedQuery) return [];
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return SEARCHABLE_CONTENT.filter(entry => {
      const hay = `${entry.title} ${entry.text}`.toLowerCase();
      return terms.every(term => hay.includes(term));
    });
  }, [normalizedQuery]);

  const matchingTabs = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(articleHits.map(entry => entry.tab));
  }, [normalizedQuery, articleHits]);

  const filteredGuides = useMemo(() => {
    if (!normalizedQuery) return GUIDES;
    return GUIDES.filter(
      g =>
        g.title.toLowerCase().includes(normalizedQuery) ||
        g.desc.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const showTab = (tab: string) => !matchingTabs || matchingTabs.has(tab);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
        <div className="text-center space-y-4 py-6 md:py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Help Center
          </p>
          <h1 className="text-3xl md:text-4xl font-heading font-bold tracking-tight text-foreground">
            How can we help you today?
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Explore guides, FAQs, and best practices for the Job Sheet QA
            Auditor.
          </p>

          <div className="max-w-xl mx-auto relative mt-6">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search guides, policies, or questions..."
              className="pl-10 h-12 text-base shadow-sm border-border/80 focus-visible:ring-primary/30"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {normalizedQuery && (
              <div className="text-left mt-2 pl-1 space-y-1">
                <p className="text-xs text-muted-foreground">
                  {articleHits.length === 0 && filteredGuides.length === 0
                    ? `No results for "${searchQuery}"`
                    : `${articleHits.length} article match${articleHits.length === 1 ? "" : "es"} · ${matchingTabs?.size ?? 0} categor${(matchingTabs?.size ?? 0) === 1 ? "y" : "ies"}`}
                </p>
                {articleHits.length > 0 ? (
                  <ul className="text-xs space-y-0.5">
                    {articleHits.slice(0, 6).map(hit => (
                      <li key={`${hit.tab}-${hit.title}`}>
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setActiveTab(hit.tab)}
                        >
                          {hit.title}
                        </button>
                        <span className="text-muted-foreground">
                          {" "}
                          ·{" "}
                          {HELP_CATEGORIES.find(c => c.id === hit.tab)?.label ??
                            hit.tab}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {HELP_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isMatch = showTab(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveTab(cat.id);
                  setSearchQuery("");
                }}
                className={`text-left rounded-lg border p-4 transition-all hover:border-primary/40 hover:bg-primary/5 ${
                  activeTab === cat.id
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                    : isMatch
                      ? "border-border/80 bg-card"
                      : "border-border/40 bg-muted/30 opacity-50"
                }`}
              >
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {cat.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {cat.description}
                </p>
              </button>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/50 gap-1">
            {HELP_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              if (!showTab(cat.id)) return null;
              return (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="h-11 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" /> {cat.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {showTab("overview") && (
            <TabsContent value="overview" className="mt-8 space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-md transition-shadow border-primary/10">
                  <CardHeader>
                    <div className="h-10 w-10 rounded-lg bg-[rgba(190,218,65,0.15)] flex items-center justify-center mb-2">
                      <ShieldCheck className="h-6 w-6 text-foreground" />
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
                    <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center mb-2">
                      <Zap className="h-6 w-6 text-foreground" />
                    </div>
                    <CardTitle>Workflow Engine</CardTitle>
                    <CardDescription>
                      From upload to approval or dispute.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Discover the lifecycle of a job sheet: Ingestion → OCR
                    Extraction → Rule Validation → Scoring → Technician Feedback
                    → Dispute/Approval.
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
          )}

          {showTab("guides") && (
            <TabsContent value="guides" className="mt-8">
              <div className="grid gap-4">
                {filteredGuides.length > 0 ? (
                  filteredGuides.map((guide, i) => (
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
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Open ${guide.title}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <Card className="p-8 text-center text-muted-foreground">
                    <Book className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No guides match your search.</p>
                  </Card>
                )}
              </div>
            </TabsContent>
          )}

          {showTab("faqs") && (
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
                        The First Fix Rate is calculated by analyzing the
                        percentage of jobs that do not require a return visit
                        within a 30-day window. We track asset IDs and correlate
                        them with visit dates to identify repeat attendances.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                      <AccordionTrigger>
                        What happens if the AI misreads a handwritten field?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        If the confidence score for a field is low, the system
                        flags it for manual review in the "Hold Queue". A QA
                        Lead can then verify the value. If it's a persistent
                        issue, engineers can raise a dispute which you can
                        resolve in the Dispute Management portal.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                      <AccordionTrigger>
                        Can I customize the "Gold Standard" rules?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        Yes. Use Template Studio (/template-studio) to upload a
                        sample form, refine ROIs and selection tokens, run
                        activation gates on staging, then dual-control promote
                        to production. The live audit pipeline uses the template
                        registry — not legacy gold-spec authoring.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                      <AccordionTrigger>
                        How does the "Deep Note Analysis" work?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        Deep Note is a clinical documentation rubric (what
                        failed, parts stance, next action) built from COMMENT-C
                        rules. Scores are Clarity and Completeness — advisory
                        only; Majors still come from COMMENT-C. An optional
                        per-sheet sufficiency LLM may enrich the advisory when
                        enabled; it never hard-fails a sheet on its own.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {showTab("best-practices") && (
            <TabsContent value="best-practices" className="mt-8">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-muted border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-foreground">
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
                          Write legibly in block capitals for critical fields
                          like Asset IDs.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary">•</span>
                        <span>
                          Ensure detailed notes explaining <strong>what</strong>{" "}
                          was done and <strong>why</strong>.
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

                <Card className="bg-muted border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-primary" />
                      <CardTitle className="text-foreground">
                        For QA Leads
                      </CardTitle>
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
                          Use "First Fix Analysis" to identify training needs
                          for specific engineers.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary">•</span>
                        <span>
                          Adjust AI Persona for advisory voice gradually; use
                          Audit Policy for Major/Minor fail law.
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
                    Avoid "pencil whipping" checks—the AI looks for unique
                    patterns in checkmarks. Do not reuse photos from previous
                    jobs; the system detects duplicate image hashes.
                  </p>
                </div>
              </div>
            </TabsContent>
          )}

          {showTab("policies") && (
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
                        Two different scores — one for the document, one for the
                        OCR read.
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
                        Starts at <strong>100 %</strong> and drops when the
                        auditor finds documentation problems — missing fields,
                        inconsistent values, or incomplete notes. Defaults:{" "}
                        <strong>Major −25</strong>, <strong>Minor −10</strong>.
                        A sheet only <strong>PASS</strong>es when there are no
                        majors <em>and</em> Doc Quality is at least{" "}
                        <strong>85</strong> (configurable pass mark).
                      </p>
                      <p>
                        Think of it as a <em>paperwork score</em>: "How complete
                        and correct is this job sheet?" An engineer's period
                        Quality Score is the <strong>average</strong> of their
                        sheet Doc Quality marks (target 95).
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-primary" />
                        Extract Confidence %
                      </h4>
                      <p>
                        How sure the OCR engine is that it read a particular
                        field correctly. A field showing{" "}
                        <span className="font-mono text-xs bg-muted px-1 rounded">
                          92% Extract conf.
                        </span>{" "}
                        means the system is 92 % confident in the value it
                        extracted from the handwriting or print.
                      </p>
                      <p>
                        Low Extract Confidence does <strong>not</strong> deduct
                        from Doc Quality — it instead flags the field for human
                        review in the Hold Queue.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start rounded-lg bg-muted/50 p-3">
                    <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                    <p>
                      <strong>In short:</strong> Doc Quality measures the{" "}
                      <em>engineer's</em> paperwork. Extract Confidence measures
                      the <em>system's</em> ability to read it.
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
                        Minimum tread depth and inflation bands for trailer
                        tyres.
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
                      Every recorded tread position (OSF, NSF, OSR, NSR, plus
                      3rd- axle variants) must be{" "}
                      <strong className="text-foreground">≥ 2.0 mm</strong>. A
                      reading below 2 mm triggers an S1 Major finding and an
                      immediate fail of the audit.
                    </p>
                    <p>
                      Exactly 2.0 mm is a <em>pass</em> — the rule is "greater
                      than or equal to."
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="font-semibold text-foreground">
                      PSI / Inflation Bands (TYRE-C020)
                    </h4>
                    <p>
                      When the system reads both a tyre size and a PSI value, it
                      checks the pressure against the manufacturer-recommended
                      cold- inflation band for that size. If the size is unknown
                      or missing, no PSI fail is raised (informational only).
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
                      Sizes not listed above are treated as informational — PSI
                      is recorded but no pass/fail is issued.
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
                        <strong className="text-foreground">
                          immediate FAIL
                        </strong>{" "}
                        of the entire job card, regardless of the Doc Quality
                        score. Default deduction:{" "}
                        <strong className="text-foreground">−25</strong> from
                        Doc Quality. Safety-critical rules cannot be
                        downgraded by non-admin users.
                      </p>
                    </div>
                    <div className="rounded-lg border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-2">
                      <Badge variant="secondary">Minor</Badge>
                      <p>
                        Minor findings deduct{" "}
                        <strong className="text-foreground">−10</strong> from
                        Doc Quality and{" "}
                        <strong className="text-foreground">
                          never hard-fail alone
                        </strong>
                        . If Doc Quality falls below the pass mark (default{" "}
                        <strong className="text-foreground">85</strong>), the
                        sheet goes to{" "}
                        <strong className="text-foreground">Needs review</strong>{" "}
                        instead of PASS.
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
                      <strong>Settings → Audit Policy</strong>. Changes apply to
                      new and reprocessed audits only — existing results keep
                      their original decision.
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
                    <strong className="text-foreground">VOR</strong> (Vehicle
                    Off Road) is a signal extracted from the job sheet
                    indicating the asset could not be returned to service. When
                    the system detects a VOR flag, it cross-checks the
                    surrounding documentation for consistency:
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
                        <strong>"All Works Completed"</strong> is expected to be
                        No when an asset is left VOR, since outstanding work
                        remains.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-primary">•</span>
                      <span>
                        <strong>"Parts Still Required"</strong> or a
                        return-visit flag should usually accompany a VOR.
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
                        paperwork matches reality — no contradictions between
                        VOR status, safety flags, and completion fields. This is
                        not an asset pass.
                      </p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4">
                      <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <strong>FAIL · docs</strong> = contradictory
                        documentation
                      </div>
                      <p>
                        The system found a mismatch — for example, VOR flagged
                        but "Safe To Use = Yes", or "All Works Completed = Yes"
                        despite the asset being off road. This needs review.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/**
 * Template Studio — upload-first form authoring.
 * Flow: Drop PDF → propose → ROI → Fields → Gates → Activate → Promote
 */

import DashboardLayout from "@/components/DashboardLayout";
import { RoiEditorV2 } from "@/components/RoiEditorV2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { showErrorToast, showSuccessToast } from "@/lib/toastHelpers";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";

type WizardStep =
  | "upload"
  | "catalog"
  | "identity"
  | "propose"
  | "roi"
  | "fields"
  | "gates"
  | "promote";

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "propose", label: "Propose" },
  { id: "roi", label: "ROI" },
  { id: "fields", label: "Fields & Tokens" },
  { id: "gates", label: "Gates" },
  { id: "promote", label: "Promote" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function TemplateStudio() {
  const { hasRole } = useAuth();
  const canAuthor = hasRole(["admin", "qa_lead"]);
  const utils = trpc.useUtils();
  const search = useSearch();
  const fromJobSheetParam = useMemo(() => {
    const raw = new URLSearchParams(search).get("fromJobSheet");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [search]);
  const bootstrappedJobRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("upload");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [client, setClient] = useState("");
  const [tokensText, setTokensText] = useState("job, sheet");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [proposalPreview, setProposalPreview] = useState<{
    confidence: number;
    source: string;
    fieldCount: number;
    rejectedFieldIds?: string[];
  } | null>(null);
  const [quickStarting, setQuickStarting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [roiDraft, setRoiDraft] = useState<{
    regions: Array<{
      name: string;
      page: number;
      bounds: { x: number; y: number; width: number; height: number };
      fields?: string[];
    }>;
  } | null>(null);
  const [specJsonText, setSpecJsonText] = useState("");
  const [selectionJsonText, setSelectionJsonText] = useState("");
  const [rejectedFields, setRejectedFields] = useState<Set<string>>(new Set());
  const [smokeIdsText, setSmokeIdsText] = useState("");
  const [diffFromId, setDiffFromId] = useState<string>("");
  const [diffToId, setDiffToId] = useState<string>("");

  const { data: templates, isLoading } = trpc.templates.list.useQuery();
  const { data: version } = trpc.templates.getVersion.useQuery(
    { versionId: versionId! },
    { enabled: versionId != null }
  );
  const { data: versions } = trpc.templates.listVersions.useQuery(
    { templateId: templateId! },
    { enabled: templateId != null }
  );
  const { data: activationReport, refetch: refetchReport } =
    trpc.templates.studio.activationReport.useQuery(
      { versionId: versionId! },
      { enabled: versionId != null && (step === "gates" || step === "promote") }
    );
  const { data: promotes, refetch: refetchPromotes } =
    trpc.templates.studio.listPromotes.useQuery(undefined, {
      enabled: canAuthor && (step === "promote" || step === "catalog"),
    });

  const createDraft = trpc.templates.studio.createDraft.useMutation();
  const attachSample = trpc.templates.studio.attachSample.useMutation();
  const proposeMut = trpc.templates.studio.proposeFromSample.useMutation();
  const quickStart = trpc.templates.studio.quickStartFromSample.useMutation();
  const bootstrapJob =
    trpc.templates.studio.bootstrapFromJobSheet.useMutation();
  const saveDraft = trpc.templates.studio.saveDraft.useMutation();
  const updateRoi = trpc.templates.updateRoi.useMutation();
  const activateStaging = trpc.templates.studio.activateStaging.useMutation();
  const dryRunMut = trpc.templates.studio.dryRun.useMutation();
  const ackDryRun = trpc.templates.studio.acknowledgeDryRun.useMutation();
  const scaffoldFixtures = trpc.templates.studio.scaffoldFixtures.useMutation();
  const requestPromote = trpc.templates.studio.requestPromote.useMutation();
  const approvePromote = trpc.templates.studio.approvePromote.useMutation();
  const applyPromote = trpc.templates.studio.applyPromote.useMutation();
  const rejectPromote = trpc.templates.studio.rejectPromote.useMutation();

  const { data: diffReport } = trpc.templates.studio.diffVersions.useQuery(
    {
      fromVersionId: Number(diffFromId),
      toVersionId: Number(diffToId),
    },
    {
      enabled:
        Number.isFinite(Number(diffFromId)) &&
        Number.isFinite(Number(diffToId)) &&
        Number(diffFromId) > 0 &&
        Number(diffToId) > 0,
    }
  );

  const stepIndex = useMemo(() => STEPS.findIndex(s => s.id === step), [step]);

  const loadVersionIntoEditors = (v: NonNullable<typeof version>) => {
    setSpecJsonText(JSON.stringify(v.specJson, null, 2));
    setSelectionJsonText(JSON.stringify(v.selectionConfigJson, null, 2));
    setRoiDraft(v.roiJson);
    setTokensText(
      (v.selectionConfigJson.requiredTokensAny || []).join(", ") || "job, sheet"
    );
  };

  useEffect(() => {
    if (version) loadVersionIntoEditors(version);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when version id/hash changes
  }, [version?.id, version?.hashSha256]);

  useEffect(() => {
    if (versionId == null) return;
    void utils.templates.studio.getSample
      .fetch({ versionId })
      .then(sample => {
        if (sample?.sampleUrl) setSampleUrl(sample.sampleUrl);
      })
      .catch(() => {
        /* no sample yet */
      });
  }, [versionId, utils.templates.studio.getSample]);

  const applyQuickStartResult = (result: {
    template: { id: number; name: string };
    version: NonNullable<typeof version>;
    proposal: {
      geminiUsed: boolean;
      layoutAvailable: boolean;
      proposedSpec: { fields: Array<{ field: string }> };
      fields?: Array<{ confidence: number; field: { field: string } }>;
      selectionTokens?: { confidence: number };
    };
    sampleUrl: string;
  }) => {
    setTemplateId(result.template.id);
    setVersionId(result.version.id);
    setName(result.template.name);
    setSampleUrl(result.sampleUrl);
    loadVersionIntoEditors(result.version);
    const fieldConfs = result.proposal.fields?.map(f => f.confidence) ?? [];
    const confidence =
      fieldConfs.length > 0
        ? fieldConfs.reduce((a, b) => a + b, 0) / fieldConfs.length
        : (result.proposal.selectionTokens?.confidence ?? 0.5);
    setProposalPreview({
      confidence,
      source: result.proposal.geminiUsed
        ? "Gemini + OCR"
        : result.proposal.layoutAvailable
          ? "OCR heuristics"
          : "Starter scaffold",
      fieldCount: result.proposal.proposedSpec.fields.length,
    });
    setStep("propose");
  };

  const handleQuickStartFile = async (file: File) => {
    if (!canAuthor) return;
    setQuickStarting(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await quickStart.mutateAsync({
        fileName: file.name,
        fileType: file.type || "application/pdf",
        fileBase64,
        name: name.trim() || undefined,
        client: client.trim() || undefined,
        selectionTokens: tokensText
          .split(",")
          .map(t => t.trim())
          .filter(Boolean),
      });
      applyQuickStartResult(
        result as Parameters<typeof applyQuickStartResult>[0]
      );
      await utils.templates.list.invalidate();
      showSuccessToast(
        "Draft ready",
        `${result.template.name} — review the proposal`
      );
    } catch (err) {
      showErrorToast(
        "Quick start failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setQuickStarting(false);
    }
  };

  useEffect(() => {
    if (!canAuthor || fromJobSheetParam == null) return;
    if (bootstrappedJobRef.current === fromJobSheetParam) return;
    bootstrappedJobRef.current = fromJobSheetParam;
    setQuickStarting(true);
    void bootstrapJob
      .mutateAsync({ jobSheetId: fromJobSheetParam })
      .then(result => {
        applyQuickStartResult(
          result as Parameters<typeof applyQuickStartResult>[0]
        );
        void utils.templates.list.invalidate();
        showSuccessToast(
          "Teaching from job sheet",
          `Job #${fromJobSheetParam} loaded into Studio`
        );
      })
      .catch(err => {
        showErrorToast(
          "Bootstrap failed",
          err instanceof Error ? err.message : "Could not load job sheet PDF"
        );
        bootstrappedJobRef.current = null;
      })
      .finally(() => setQuickStarting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep-link
  }, [canAuthor, fromJobSheetParam]);

  const openTemplate = (id: number, activeVersionId: number | null) => {
    setTemplateId(id);
    if (activeVersionId) {
      setVersionId(activeVersionId);
    } else {
      setVersionId(null);
      void utils.templates.listVersions.fetch({ templateId: id }).then(vs => {
        if (vs?.[0]) setVersionId(vs[0].id);
      });
    }
    setStep("identity");
  };

  const handleCreateDraft = async () => {
    if (!name.trim()) {
      showErrorToast("Name required", "Enter a template name");
      return;
    }
    try {
      const result = await createDraft.mutateAsync({
        name: name.trim(),
        templateId: slug.trim() || undefined,
        client: client.trim() || undefined,
        selectionTokens: tokensText
          .split(",")
          .map(t => t.trim())
          .filter(Boolean),
      });
      setTemplateId(result.template.id);
      setVersionId(result.version.id);
      loadVersionIntoEditors(result.version);
      await utils.templates.list.invalidate();
      showSuccessToast("Draft created", result.template.templateId);
      setStep("propose");
    } catch (err) {
      showErrorToast(
        "Create failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  };

  const handleAttachSample = async (file: File) => {
    if (!versionId) return;
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await attachSample.mutateAsync({
        versionId,
        fileName: file.name,
        fileType: file.type || "application/pdf",
        fileBase64,
      });
      setSampleUrl(result.sampleUrl);
      showSuccessToast("Sample attached", file.name);
      setStep("propose");
    } catch (err) {
      showErrorToast(
        "Sample upload failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  };

  const handlePropose = async (applyAccepted: boolean) => {
    if (!versionId) return;
    try {
      const result = await proposeMut.mutateAsync({
        versionId,
        templateName: name || undefined,
        applyAccepted,
        rejectedFieldIds: applyAccepted
          ? Array.from(rejectedFields)
          : undefined,
      });
      if (result.appliedVersion) {
        loadVersionIntoEditors(result.appliedVersion);
        await utils.templates.getVersion.invalidate({ versionId });
      }
      setProposalPreview({
        confidence:
          result.proposal.fields.length > 0
            ? result.proposal.fields.reduce((a, f) => a + f.confidence, 0) /
              result.proposal.fields.length
            : result.proposal.selectionTokens.confidence,
        source: result.proposal.geminiUsed
          ? "Gemini + OCR"
          : result.proposal.layoutAvailable
            ? "OCR heuristics"
            : "Starter scaffold (no sample OCR)",
        fieldCount: result.proposal.proposedSpec.fields.length,
      });
      showSuccessToast(
        applyAccepted ? "Proposal applied" : "Proposal ready",
        result.proposal.geminiUsed
          ? "Gemini + OCR"
          : result.proposal.layoutAvailable
            ? "OCR heuristics"
            : "Starter scaffold (no sample OCR)"
      );
      return result.proposal;
    } catch (err) {
      showErrorToast(
        "Propose failed",
        err instanceof Error ? err.message : "Unknown error"
      );
      return null;
    }
  };

  const handleSaveFields = async () => {
    if (!versionId) return;
    try {
      const specJson = JSON.parse(specJsonText);
      const selectionConfigJson = JSON.parse(selectionJsonText);
      const tokens = tokensText
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
      selectionConfigJson.requiredTokensAny = tokens;
      const result = await saveDraft.mutateAsync({
        versionId,
        specJson,
        selectionConfigJson,
        roiJson: roiDraft ?? undefined,
        changeNotes: "Studio fields/tokens save",
      });
      setVersionId(result.version.id);
      loadVersionIntoEditors(result.version);
      showSuccessToast("Draft saved", result.version.version);
    } catch (err) {
      showErrorToast(
        "Save failed",
        err instanceof Error ? err.message : "Invalid JSON or server error"
      );
    }
  };

  const handleSaveRoi = async () => {
    if (!versionId || !roiDraft) return;
    try {
      await updateRoi.mutateAsync({ versionId, roiJson: roiDraft });
      showSuccessToast("ROI saved", `${roiDraft.regions.length} regions`);
    } catch (err) {
      showErrorToast(
        "ROI save failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  };

  const handleActivate = async () => {
    if (!versionId) return;
    try {
      const has = await utils.templates.hasFixtures.fetch({ versionId });
      if (!has.hasFixtures) {
        await scaffoldFixtures.mutateAsync({ versionId });
        showSuccessToast(
          "Fixtures scaffolded",
          "Review gates, then activate again if needed"
        );
      }
      const result = await activateStaging.mutateAsync({ versionId });
      await refetchReport();
      await utils.templates.list.invalidate();
      showSuccessToast(
        "Activated on staging",
        `v${result.version.version} · ${result.version.hashSha256.slice(0, 10)}`
      );
      setStep("promote");
    } catch (err) {
      showErrorToast(
        "Activation blocked",
        err instanceof Error ? err.message : "Gates failed"
      );
      await refetchReport();
    }
  };

  if (!canAuthor) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-lg py-16 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Template Studio</h1>
          <p className="mt-2 text-muted-foreground">
            Only admins and QA leads can author templates. Viewers can use
            audits as usual — templates auto-select on upload.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const showWizardChrome =
    step !== "upload" && step !== "catalog" && versionId != null;

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#6B7A1A]">
              Template Studio
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Upload a new form
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Drop a blank or filled sample PDF. We draft fields, ROIs, and
              selection tokens — you refine, gate, and activate on staging.
            </p>
          </div>
          <div className="flex gap-2">
            {step !== "upload" && (
              <Button variant="outline" onClick={() => setStep("upload")}>
                New upload
              </Button>
            )}
            {step !== "catalog" && (
              <Button variant="outline" onClick={() => setStep("catalog")}>
                Existing templates
              </Button>
            )}
          </div>
        </div>

        {showWizardChrome && (
          <div className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  step === s.id
                    ? "bg-[#BEDA41] text-[#1a1f0a]"
                    : i < stepIndex
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        )}

        {step === "upload" && (
          <div
            className={`relative overflow-hidden rounded-xl border-2 border-dashed transition ${
              dragOver
                ? "border-[#BEDA41] bg-[rgba(190,218,65,0.12)]"
                : "border-[#EBE8E8] bg-gradient-to-b from-[#F7F9EC] to-white"
            }`}
            onDragOver={e => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleQuickStartFile(file);
            }}
          >
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
              {quickStarting || bootstrapJob.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-[#6B7A1A]" />
                  <p className="text-sm font-medium text-[#333030]">
                    Creating draft, reading sample, proposing fields…
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#BEDA41]/20">
                    <Upload className="h-7 w-7 text-[#6B7A1A]" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[#333030]">
                      Drop a form PDF here
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Or choose a file — one pass from sample to proposal.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c238]"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={quickStart.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose PDF
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void handleQuickStartFile(file);
                      e.target.value = "";
                    }}
                  />
                  {fromJobSheetParam != null && (
                    <p className="text-xs text-muted-foreground">
                      Deep-link from job sheet #{fromJobSheetParam}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {step === "catalog" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Existing templates</CardTitle>
                <CardDescription>
                  Live registry versions used by upload selection.
                </CardDescription>
              </div>
              <Button onClick={() => setStep("upload")}>
                <Upload className="mr-2 h-4 w-4" />
                Upload new form
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton />
              ) : !templates?.length ? (
                <p className="text-sm text-muted-foreground">
                  No templates yet. Upload a sample to start.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                      onClick={() => openTemplate(t.id, t.activeVersionId)}
                    >
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.templateId} · {t.versionCount} version
                          {t.versionCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{t.status}</Badge>
                        {t.activeVersion ? (
                          <Badge>v{t.activeVersion}</Badge>
                        ) : (
                          <Badge variant="outline">no active</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!!promotes?.length && (
                <div className="mt-8">
                  <h3 className="mb-2 text-sm font-semibold">
                    Pending promotes
                  </h3>
                  <div className="space-y-2">
                    {promotes
                      .filter(
                        p => p.status === "pending" || p.status === "approved"
                      )
                      .map(p => (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <span>
                            {p.pack.templateSlug}@{p.pack.version}{" "}
                            <Badge variant="outline">{p.status}</Badge>
                          </span>
                          <div className="flex gap-2">
                            {p.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await approvePromote.mutateAsync({
                                        promoteId: p.id,
                                      });
                                      await refetchPromotes();
                                      showSuccessToast(
                                        "Promote approved",
                                        p.id
                                      );
                                    } catch (err) {
                                      showErrorToast(
                                        "Approve failed",
                                        err instanceof Error
                                          ? err.message
                                          : "Dual-control blocked?"
                                      );
                                    }
                                  }}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      await rejectPromote.mutateAsync({
                                        promoteId: p.id,
                                        reason: "Rejected from Template Studio",
                                      });
                                      await refetchPromotes();
                                    } catch (err) {
                                      showErrorToast(
                                        "Reject failed",
                                        err instanceof Error
                                          ? err.message
                                          : "Error"
                                      );
                                    }
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {p.status === "approved" && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await applyPromote.mutateAsync({
                                      promoteId: p.id,
                                    });
                                    await refetchPromotes();
                                    await utils.templates.list.invalidate();
                                    showSuccessToast(
                                      "Promote applied",
                                      p.pack.templateSlug
                                    );
                                  } catch (err) {
                                    showErrorToast(
                                      "Apply failed",
                                      err instanceof Error
                                        ? err.message
                                        : "Error"
                                    );
                                  }
                                }}
                              >
                                Apply to this env
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === "identity" && (
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <CardDescription>
                Name the form type and seed selection tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {versionId ? (
                <p className="text-sm text-muted-foreground">
                  Editing version #{versionId}
                  {version ? ` (${version.version})` : ""}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ts-name">Name</Label>
                  <Input
                    id="ts-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="PlantExpand Generator Service"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ts-slug">Slug (optional)</Label>
                  <Input
                    id="ts-slug"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="plantexpand-generator-v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ts-client">Client (optional)</Label>
                  <Input
                    id="ts-client"
                    value={client}
                    onChange={e => setClient(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ts-tokens">Selection tokens (any)</Label>
                  <Input
                    id="ts-tokens"
                    value={tokensText}
                    onChange={e => setTokensText(e.target.value)}
                    placeholder="job, sheet, generator"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {!versionId && (
                  <Button
                    onClick={() => void handleCreateDraft()}
                    disabled={createDraft.isPending}
                  >
                    {createDraft.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create draft
                  </Button>
                )}
                {versionId && (
                  <Button onClick={() => setStep("propose")}>
                    Continue
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "propose" && versionId && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sample PDF</CardTitle>
                <CardDescription>
                  {name || "New form"} · confidence{" "}
                  {proposalPreview
                    ? `${(proposalPreview.confidence * 100).toFixed(0)}% · ${proposalPreview.source}`
                    : "review proposal"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sampleUrl ? (
                  <iframe
                    title="Template sample"
                    src={sampleUrl}
                    className="h-[520px] w-full rounded-md border bg-white"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No sample attached yet.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#6B7A1A]" />
                  AI / OCR propose
                </CardTitle>
                <CardDescription>
                  Review proposed fields with confidence and sources. Reject
                  weak items before applying.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {proposalPreview && !proposeMut.data?.proposal && (
                  <div className="rounded-md border border-[#BEDA41]/40 bg-[#BEDA41]/10 px-3 py-2 text-sm">
                    Quick-start applied {proposalPreview.fieldCount} fields (
                    {(proposalPreview.confidence * 100).toFixed(0)}% ·{" "}
                    {proposalPreview.source}). Re-run propose to refine or
                    continue to ROI.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={proposeMut.isPending}
                    onClick={() => void handlePropose(false)}
                  >
                    {proposeMut.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Generate proposal
                  </Button>
                  <Button
                    disabled={proposeMut.isPending || !proposeMut.data}
                    onClick={() => void handlePropose(true)}
                  >
                    Apply accepted
                  </Button>
                </div>

                {proposeMut.data?.proposal && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Fields</h3>
                      {proposeMut.data.proposal.fields.map(f => {
                        const rejected = rejectedFields.has(f.field.field);
                        return (
                          <div
                            key={f.field.field}
                            className={`rounded-md border px-3 py-2 text-sm ${
                              rejected ? "opacity-50" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {f.field.label}
                              </span>
                              <Badge variant="secondary">
                                {(f.confidence * 100).toFixed(0)}% · {f.source}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {f.why}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-1 h-7 px-2"
                              onClick={() => {
                                setRejectedFields(prev => {
                                  const next = new Set(prev);
                                  if (next.has(f.field.field))
                                    next.delete(f.field.field);
                                  else next.add(f.field.field);
                                  return next;
                                });
                              }}
                            >
                              {rejected ? "Undo reject" : "Reject"}
                            </Button>
                          </div>
                        );
                      })}
                      {proposeMut.data.proposal.layoutError && (
                        <p className="text-xs text-amber-700">
                          Layout note: {proposeMut.data.proposal.layoutError}
                        </p>
                      )}
                      {proposeMut.data.proposal.geminiError && (
                        <p className="text-xs text-muted-foreground">
                          Gemini: {proposeMut.data.proposal.geminiError}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        Checklist / tokens
                      </h3>
                      <p className="text-sm">
                        Checklist grid:{" "}
                        {proposeMut.data.proposal.hasChecklistGrid
                          ? "detected"
                          : "not detected"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tokens:{" "}
                        {proposeMut.data.proposal.selectionTokens.requiredTokensAny.join(
                          ", "
                        )}
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                        {proposeMut.data.proposal.layoutTextPreview ||
                          "(no OCR text)"}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("upload")}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={() => setStep("roi")}>
                    Continue to ROI
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "roi" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle>ROI editor</CardTitle>
              <CardDescription>
                Drag regions on the sample. Save writes to the live registry
                version.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RoiEditorV2
                initialRoi={roiDraft ?? version?.roiJson ?? undefined}
                pdfUrl={sampleUrl ?? undefined}
                onChange={roi => setRoiDraft(roi)}
                onSave={roi => {
                  setRoiDraft(roi);
                  void (async () => {
                    try {
                      await updateRoi.mutateAsync({
                        versionId,
                        roiJson: roi,
                      });
                      showSuccessToast(
                        "ROI saved",
                        `${roi.regions.length} regions`
                      );
                    } catch (err) {
                      showErrorToast(
                        "ROI save failed",
                        err instanceof Error ? err.message : "Error"
                      );
                    }
                  })();
                }}
                onPdfUpload={file => void handleAttachSample(file)}
                documentType="inspection"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("propose")}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleSaveRoi()}
                  disabled={!roiDraft || updateRoi.isPending}
                >
                  Save ROI
                </Button>
                <Button onClick={() => setStep("fields")}>
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "fields" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle>Fields, rules & selection tokens</CardTitle>
              <CardDescription>
                Edit JSON carefully — critical fields jobReference, assetId,
                date, engineerSignOff are required for activation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Selection tokens (any)</Label>
                <Input
                  value={tokensText}
                  onChange={e => setTokensText(e.target.value)}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>specJson</Label>
                  <Textarea
                    className="min-h-[280px] font-mono text-xs"
                    value={specJsonText}
                    onChange={e => setSpecJsonText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>selectionConfigJson</Label>
                  <Textarea
                    className="min-h-[280px] font-mono text-xs"
                    value={selectionJsonText}
                    onChange={e => setSelectionJsonText(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("roi")}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => void handleSaveFields()}
                  disabled={saveDraft.isPending}
                >
                  {saveDraft.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save draft
                </Button>
                <Button variant="secondary" onClick={() => setStep("gates")}>
                  Gates
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "gates" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle>Activation gates</CardTitle>
              <CardDescription>
                Dry-run mimics a live audit without writing stats. Review
                findings, confirm it looks correct, then activate on staging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchReport()}
              >
                Refresh report
              </Button>
              {!activationReport ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    Overall:{" "}
                    {activationReport.allowed ? (
                      <Badge className="bg-[#BEDA41] text-[#1a1f0a]">
                        <Check className="mr-1 h-3 w-3" /> Allowed
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Blocked</Badge>
                    )}
                    <span className="text-muted-foreground">
                      env={activationReport.environment}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium">Preconditions</h4>
                    {activationReport.preconditions.blockingIssues.length ===
                    0 ? (
                      <p className="text-muted-foreground">
                        No blocking issues
                      </p>
                    ) : (
                      <ul className="list-disc pl-5 text-destructive">
                        {activationReport.preconditions.blockingIssues.map(
                          (i, idx) => (
                            <li key={idx}>
                              {i.code}: {i.message}
                            </li>
                          )
                        )}
                      </ul>
                    )}
                    {activationReport.preconditions.warnings.map((w, idx) => (
                      <p key={idx} className="text-amber-700">
                        {w.code}: {w.message}
                      </p>
                    ))}
                  </div>
                  <div>
                    <h4 className="font-medium">Fixtures</h4>
                    <p className="text-muted-foreground">
                      {activationReport.fixtures.hasFixtures
                        ? `Present · ${activationReport.fixtures.report?.overallResult ?? "?"}`
                        : "None yet — activate will scaffold then re-check"}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">Collision</h4>
                    <p
                      className={
                        activationReport.collision.allowed
                          ? "text-muted-foreground"
                          : "text-destructive"
                      }
                    >
                      {activationReport.collision.message}
                    </p>
                  </div>

                  <div className="rounded-md border border-[#BEDA41]/40 bg-[#F7F9EC] p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-[#333030]">
                          Dry-run audit
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Dress rehearsal under this draft. Does not enter live
                          stats or scorecards.
                        </p>
                      </div>
                      {activationReport.dryRun.allowed ? (
                        <Badge className="bg-[#BEDA41] text-[#1a1f0a]">
                          Confirmed
                        </Badge>
                      ) : activationReport.dryRun.report?.pipelineOk ? (
                        <Badge variant="secondary">Needs confirm</Badge>
                      ) : (
                        <Badge variant="outline">
                          {activationReport.dryRun.code}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-[#333030]">
                      {activationReport.dryRun.message}
                    </p>
                    {activationReport.dryRun.report && (
                      <div className="space-y-2 text-xs">
                        <p>
                          Mode{" "}
                          <strong>
                            {activationReport.dryRun.report.assessmentMode}
                          </strong>
                          {" · "}
                          Result{" "}
                          <strong>
                            {activationReport.dryRun.report.overallResult}
                          </strong>
                          {activationReport.dryRun.report.score != null && (
                            <>
                              {" · "}Score{" "}
                              <strong>
                                {activationReport.dryRun.report.score}
                              </strong>
                            </>
                          )}
                          {" · "}
                          {activationReport.dryRun.report.durationMs}ms
                        </p>
                        {activationReport.dryRun.report.blockingIssues.length >
                          0 && (
                          <ul className="list-disc pl-4 text-destructive">
                            {activationReport.dryRun.report.blockingIssues.map(
                              (code, idx) => (
                                <li key={idx}>{code}</li>
                              )
                            )}
                          </ul>
                        )}
                        {activationReport.dryRun.report.findings.length > 0 && (
                          <div className="max-h-48 overflow-auto rounded border bg-white p-2 space-y-1">
                            <p className="font-medium text-[#333030]">
                              Findings to finesse (
                              {activationReport.dryRun.report.findings.length})
                            </p>
                            {activationReport.dryRun.report.findings.map(
                              (f, idx) => (
                                <div
                                  key={idx}
                                  className="border-b border-[#EBE8E8] pb-1 last:border-0"
                                >
                                  <span className="font-medium">
                                    {f.fieldName || f.ruleId || "finding"}
                                  </span>
                                  {f.severity ? ` · ${f.severity}` : ""}
                                  {f.reasonCode ? ` · ${f.reasonCode}` : ""}
                                  {f.whyItMatters ? (
                                    <p className="text-muted-foreground">
                                      {f.whyItMatters}
                                    </p>
                                  ) : null}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-[#BEDA41] text-[#1a1f0a] hover:bg-[#a8c238]"
                        disabled={dryRunMut.isPending || !sampleUrl}
                        onClick={async () => {
                          try {
                            const report = await dryRunMut.mutateAsync({
                              versionId,
                              jobSheetIds: smokeIdsText
                                .split(",")
                                .map(s => Number(s.trim()))
                                .filter(n => Number.isFinite(n) && n > 0),
                            });
                            await refetchReport();
                            showSuccessToast(
                              report.pipelineOk
                                ? "Dry-run complete"
                                : "Dry-run finished with blockers",
                              report.pipelineOk
                                ? "Review findings, then confirm"
                                : report.blockingIssues.join(", ")
                            );
                          } catch (err) {
                            showErrorToast(
                              "Dry-run failed",
                              err instanceof Error ? err.message : "Error"
                            );
                          }
                        }}
                      >
                        {dryRunMut.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Run dry-run audit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          ackDryRun.isPending ||
                          !activationReport.dryRun.report?.pipelineOk ||
                          activationReport.dryRun.allowed
                        }
                        onClick={async () => {
                          try {
                            await ackDryRun.mutateAsync({
                              versionId,
                              hashSha256: activationReport.hashSha256,
                            });
                            await refetchReport();
                            showSuccessToast(
                              "Dry-run confirmed",
                              "You can activate on staging"
                            );
                          } catch (err) {
                            showErrorToast(
                              "Confirm failed",
                              err instanceof Error ? err.message : "Error"
                            );
                          }
                        }}
                      >
                        {ackDryRun.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Confirm dry-run looks correct
                      </Button>
                    </div>
                    {!sampleUrl && (
                      <p className="text-xs text-amber-700">
                        Attach a sample PDF first — dry-run needs the Studio
                        sample.
                      </p>
                    )}
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs">
                        Optional filled job sheet IDs (comma-separated)
                      </Label>
                      <Input
                        className="h-8 text-xs"
                        value={smokeIdsText}
                        onChange={e => setSmokeIdsText(e.target.value)}
                        placeholder="101, 102"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("fields")}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => void handleActivate()}
                  disabled={
                    activateStaging.isPending ||
                    !activationReport?.allowed ||
                    !activationReport?.dryRun.allowed
                  }
                >
                  {activateStaging.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Activate on staging
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "promote" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle>Promote to production</CardTitle>
              <CardDescription>
                Dual control: a second admin/QA lead must approve. Self-approve
                is blocked.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Smoke job sheet IDs (optional, comma-separated)</Label>
                <Input
                  value={smokeIdsText}
                  onChange={e => setSmokeIdsText(e.target.value)}
                  placeholder="101, 102"
                />
              </div>
              <Button
                onClick={async () => {
                  try {
                    const smokeJobSheetIds = smokeIdsText
                      .split(",")
                      .map(s => Number(s.trim()))
                      .filter(n => Number.isFinite(n) && n > 0);
                    const req = await requestPromote.mutateAsync({
                      versionId,
                      smokeJobSheetIds,
                      notes: "Requested from Template Studio",
                    });
                    await refetchPromotes();
                    showSuccessToast("Promote requested", req.id);
                  } catch (err) {
                    showErrorToast(
                      "Promote request failed",
                      err instanceof Error ? err.message : "Error"
                    );
                  }
                }}
                disabled={requestPromote.isPending || !version?.isActive}
              >
                Request promote
              </Button>
              {!version?.isActive && (
                <p className="text-sm text-amber-700">
                  Version must be staging-active before promote.
                </p>
              )}

              {versions && versions.length >= 2 && (
                <div className="mt-6 space-y-2 border-t pt-4">
                  <h3 className="text-sm font-semibold">Version diff</h3>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="w-32"
                      placeholder="From ID"
                      value={diffFromId}
                      onChange={e => setDiffFromId(e.target.value)}
                    />
                    <Input
                      className="w-32"
                      placeholder="To ID"
                      value={diffToId}
                      onChange={e => setDiffToId(e.target.value)}
                    />
                  </div>
                  {diffReport && (
                    <div className="text-xs text-muted-foreground">
                      Fields {diffReport.summary.fieldChanges} · Rules{" "}
                      {diffReport.summary.ruleChanges} · Tokens{" "}
                      {diffReport.summary.tokenChanges} · ROI{" "}
                      {diffReport.summary.roiChanges}
                      <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5">
                        {diffReport.entries.slice(0, 40).map((e, i) => (
                          <li key={i}>
                            {e.change} {e.path}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <Button variant="outline" onClick={() => setStep("gates")}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

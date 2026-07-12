/**
 * Template Studio — replace Spec Management.
 * Wizard: Identity → Sample → Propose → ROI → Tokens/Fields → Gates → Activate → Promote
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
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";

type WizardStep =
  | "catalog"
  | "identity"
  | "sample"
  | "propose"
  | "roi"
  | "fields"
  | "gates"
  | "promote";

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "sample", label: "Sample PDF" },
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

  const [step, setStep] = useState<WizardStep>("catalog");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [client, setClient] = useState("");
  const [tokensText, setTokensText] = useState("job, sheet");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
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
  const saveDraft = trpc.templates.studio.saveDraft.useMutation();
  const updateRoi = trpc.templates.updateRoi.useMutation();
  const activateStaging = trpc.templates.studio.activateStaging.useMutation();
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

  const openTemplate = (id: number, activeVersionId: number | null) => {
    setTemplateId(id);
    if (activeVersionId) {
      setVersionId(activeVersionId);
    } else {
      const t = templates?.find(x => x.id === id);
      // Prefer latest via listVersions after set
      setVersionId(null);
      void utils.templates.listVersions.fetch({ templateId: id }).then(vs => {
        if (vs?.[0]) setVersionId(vs[0].id);
      });
      void t;
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
      setStep("sample");
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
      });
      setRejectedFields(new Set());
      if (result.appliedVersion) {
        loadVersionIntoEditors(result.appliedVersion);
        await utils.templates.getVersion.invalidate({ versionId });
      }
      showSuccessToast(
        applyAccepted ? "Proposal applied" : "Proposal ready",
        result.proposal.geminiUsed
          ? "Gemini + OCR"
          : result.proposal.layoutAvailable
            ? "OCR heuristics"
            : "Starter scaffold"
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
      await scaffoldFixtures.mutateAsync({ versionId });
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

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#6B7A1A]">
              Template Studio
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Onboard form types end-to-end
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Upload a sample, refine ROIs and selection tokens, pass activation
              gates on staging, then dual-control promote to production.
            </p>
          </div>
          {step !== "catalog" && (
            <Button variant="outline" onClick={() => setStep("catalog")}>
              Catalog
            </Button>
          )}
        </div>

        {step !== "catalog" && (
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

        {step === "catalog" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Template catalog</CardTitle>
                <CardDescription>
                  Live registry versions used by upload selection.
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setTemplateId(null);
                  setVersionId(null);
                  setName("");
                  setSlug("");
                  setSpecJsonText("");
                  setStep("identity");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New draft
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton />
              ) : !templates?.length ? (
                <p className="text-sm text-muted-foreground">
                  No templates yet. Create a draft to start.
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
                  <Button onClick={() => setStep("sample")}>
                    Continue
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "sample" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle>Sample PDF</CardTitle>
              <CardDescription>
                Attach a blank or lightly filled form for ROI + OCR propose.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#BEDA41]/60 bg-[#BEDA41]/5 px-6 py-12 text-center">
                <Upload className="h-8 w-8 text-[#6B7A1A]" />
                <span className="text-sm font-medium">
                  Drop PDF or click to upload
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachSample(f);
                  }}
                />
              </label>
              {sampleUrl && (
                <p className="text-xs text-muted-foreground">
                  Sample URL: {sampleUrl}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("identity")}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={() => setStep("propose")}>
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "propose" && versionId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#6B7A1A]" />
                AI / OCR propose
              </CardTitle>
              <CardDescription>
                Review proposed fields with confidence and sources. Reject weak
                items before applying.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                            <span className="font-medium">{f.field.label}</span>
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
                <Button variant="outline" onClick={() => setStep("sample")}>
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
                Preconditions, fixtures, and fingerprint collision must pass
                before staging activate.
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
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("fields")}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => void handleActivate()}
                  disabled={activateStaging.isPending}
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

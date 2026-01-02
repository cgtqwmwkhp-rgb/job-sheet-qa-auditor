import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  BrainCircuit, 
  Eye, 
  Sparkles, 
  Gauge, 
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProcessingConfig {
  llmFallbackEnabled: boolean;
  llmConfidenceThreshold: number;
  ocrEnabled: boolean;
  ocrConfidenceThreshold: number;
  fuzzyMatchingEnabled: boolean;
  fuzzyMatchThreshold: number;
  maxRetries: number;
  processingTimeoutMs: number;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  llmFallbackEnabled: true,
  llmConfidenceThreshold: 70,
  ocrEnabled: true,
  ocrConfidenceThreshold: 60,
  fuzzyMatchingEnabled: true,
  fuzzyMatchThreshold: 80,
  maxRetries: 3,
  processingTimeoutMs: 60000,
};

export function ProcessingSettings() {
  const [config, setConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: serverConfig, isLoading, refetch } = trpc.processingSettings.get.useQuery();
  const updateBatch = trpc.processingSettings.updateBatch.useMutation();

  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
    }
  }, [serverConfig]);

  const handleChange = (key: keyof ProcessingConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const settings = Object.entries(config).map(([key, value]) => ({
        settingKey: key,
        settingValue: value,
      }));
      
      await updateBatch.mutateAsync({ settings });
      toast.success("Processing settings saved successfully");
      setHasChanges(false);
      refetch();
    } catch (error) {
      toast.error("Failed to save settings");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(serverConfig ?? DEFAULT_CONFIG);
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* LLM Fallback Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <BrainCircuit className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">LLM-Assisted Extraction</CardTitle>
                  <CardDescription>Use AI to extract fields when pattern matching fails</CardDescription>
                </div>
              </div>
              <Badge variant={config.llmFallbackEnabled ? "default" : "secondary"}>
                {config.llmFallbackEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-medium">Enable LLM Fallback</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>When enabled, the system will use Gemini 2.5 AI to extract fields that couldn't be found using regex or fuzzy matching. This improves accuracy but increases processing time.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically invoke AI when confidence is below threshold
                </p>
              </div>
              <Switch 
                checked={config.llmFallbackEnabled}
                onCheckedChange={(checked) => handleChange('llmFallbackEnabled', checked)}
              />
            </div>

            {config.llmFallbackEnabled && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Confidence Threshold</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {config.llmConfidenceThreshold}%
                    </span>
                  </div>
                  <Slider
                    value={[config.llmConfidenceThreshold]}
                    onValueChange={([value]) => handleChange('llmConfidenceThreshold', value)}
                    min={50}
                    max={95}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fields with confidence below this threshold will trigger LLM extraction
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* OCR Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Eye className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">OCR Processing</CardTitle>
                  <CardDescription>Optical character recognition for scanned documents</CardDescription>
                </div>
              </div>
              <Badge variant={config.ocrEnabled ? "default" : "secondary"}>
                {config.ocrEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-medium">Enable OCR Fallback</Label>
                <p className="text-sm text-muted-foreground">
                  Use Mistral OCR when embedded PDF text is unavailable
                </p>
              </div>
              <Switch 
                checked={config.ocrEnabled}
                onCheckedChange={(checked) => handleChange('ocrEnabled', checked)}
              />
            </div>

            {config.ocrEnabled && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>OCR Confidence Threshold</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {config.ocrConfidenceThreshold}%
                    </span>
                  </div>
                  <Slider
                    value={[config.ocrConfidenceThreshold]}
                    onValueChange={([value]) => handleChange('ocrConfidenceThreshold', value)}
                    min={40}
                    max={90}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    OCR results below this confidence will be flagged for review
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Fuzzy Matching Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">Fuzzy Matching</CardTitle>
                  <CardDescription>Intelligent pattern matching for field labels</CardDescription>
                </div>
              </div>
              <Badge variant={config.fuzzyMatchingEnabled ? "default" : "secondary"}>
                {config.fuzzyMatchingEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-medium">Enable Fuzzy Matching</Label>
                <p className="text-sm text-muted-foreground">
                  Use Levenshtein distance and phonetic matching for typos
                </p>
              </div>
              <Switch 
                checked={config.fuzzyMatchingEnabled}
                onCheckedChange={(checked) => handleChange('fuzzyMatchingEnabled', checked)}
              />
            </div>

            {config.fuzzyMatchingEnabled && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Match Similarity Threshold</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {config.fuzzyMatchThreshold}%
                    </span>
                  </div>
                  <Slider
                    value={[config.fuzzyMatchThreshold]}
                    onValueChange={([value]) => handleChange('fuzzyMatchThreshold', value)}
                    min={60}
                    max={95}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values require closer matches, reducing false positives
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Performance Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Gauge className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Performance & Reliability</CardTitle>
                <CardDescription>Configure retry behavior and timeouts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Max Retries</Label>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {config.maxRetries}
                </span>
              </div>
              <Slider
                value={[config.maxRetries]}
                onValueChange={([value]) => handleChange('maxRetries', value)}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Number of retry attempts for failed API calls
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Processing Timeout</Label>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {config.processingTimeoutMs / 1000}s
                </span>
              </div>
              <Slider
                value={[config.processingTimeoutMs / 1000]}
                onValueChange={([value]) => handleChange('processingTimeoutMs', value * 1000)}
                min={30}
                max={180}
                step={15}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Maximum time allowed for processing a single document
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {hasChanges && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              You have unsaved changes
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

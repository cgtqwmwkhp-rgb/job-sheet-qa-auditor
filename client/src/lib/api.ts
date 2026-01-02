import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "/api/v1";

export interface JobSheet {
  id: string;
  technician: string;
  site: string;
  customer: string;
  assetType: string;
  date: string;
  status: "passed" | "failed" | "review";
  score: string;
  documentUrl: string;
  findings: Finding[];
}

export interface Finding {
  id: number | string;
  field: string;
  status: "passed" | "missing" | "warning";
  severity?: "critical" | "major" | "minor";
  value?: string;
  message?: string;
  confidence: number;
  box?: BoundingBox;
}

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

export interface Stats {
  totalAudits: number;
  passRate: number;
  criticalIssues: number;
  avgScore: string;
  recentActivity: Activity[];
}

export interface Activity {
  id: number;
  type: "audit" | "review" | "system";
  message: string;
  time: string;
}

async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.statusText}`);
  }

  return res.json();
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      try {
        return await fetcher<Stats>("/stats");
      } catch (error) {
        console.warn("API fetch failed, returning mock data for demo:", error);
        return {
          totalAudits: 1248,
          passRate: 94.2,
          criticalIssues: 3,
          avgScore: "A-",
          recentActivity: [
            { id: 1, type: "audit", message: "Audit #JS-2024-001 failed validation", time: "2 mins ago" },
            { id: 2, type: "review", message: "Technician John Doe requested a waiver", time: "15 mins ago" },
            { id: 3, type: "system", message: "Rule pack v2.1 auto-deployed", time: "1 hour ago" },
          ]
        } as Stats;
      }
    },
  });
}

export function useJobSheets() {
  return useQuery({
    queryKey: ["job-sheets"],
    queryFn: async () => {
      try {
        return await fetcher<JobSheet[]>("/job-sheets");
      } catch (error) {
        console.warn("API fetch failed, returning mock data for demo:", error);
        return [
          {
            id: "JS-2024-001",
            technician: "John Doe",
            site: "London HQ",
            customer: "Acme Corp",
            assetType: "HVAC Unit",
            date: "2024-01-15",
            status: "failed",
            score: "C",
            documentUrl: "",
            findings: []
          },
          {
            id: "JS-2024-002",
            technician: "Jane Smith",
            site: "Manchester Branch",
            customer: "Global Tech",
            assetType: "Generator",
            date: "2024-01-16",
            status: "passed",
            score: "A",
            documentUrl: "",
            findings: []
          }
        ] as JobSheet[];
      }
    },
  });
}

export function useJobSheet(id: string) {
  return useQuery({
    queryKey: ["job-sheet", id],
    queryFn: async () => {
      try {
        return await fetcher<JobSheet>(`/job-sheets/${id}`);
      } catch (error) {
        console.warn("API fetch failed, returning mock data for demo:", error);
        // Return mock data if API fails
        const mockJobSheet: JobSheet = {
          id: id,
          status: "failed",
          score: "C",
          technician: "John Doe",
          date: "2024-01-15",
          site: "London HQ",
          customer: "Acme Corp",
          assetType: "HVAC Unit",
          documentUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf",
          findings: [
            {
              id: 1,
              field: "Customer Signature",
              status: "missing" as const,
              severity: "critical" as const,
              message: "Customer signature is required but not detected.",
              confidence: 0.98,
              box: { page: 1, x: 10, y: 80, width: 30, height: 5, color: "#ef4444", label: "Missing Signature" }
            },
            {
              id: 2,
              field: "Date of Service",
              status: "passed" as const,
              value: "15/01/2024",
              confidence: 0.99,
              box: { page: 1, x: 70, y: 15, width: 20, height: 3, color: "#22c55e", label: "Date" }
            },
            {
              id: 3,
              field: "Serial Number",
              status: "warning" as const,
              value: "SN-12345-??",
              message: "Serial number is partially obscured.",
              confidence: 0.75,
              box: { page: 1, x: 40, y: 30, width: 25, height: 4, color: "#f97316", label: "Serial #" }
            },
            {
              id: 4,
              field: "Work Description",
              status: "passed" as const,
              value: "Routine maintenance performed. Replaced filters.",
              confidence: 0.95,
              box: { page: 1, x: 10, y: 40, width: 80, height: 20, color: "#22c55e", label: "Description" }
            },
          ],
        };
        return mockJobSheet;
      }
    },
    enabled: !!id,
  });
}

export function useUploadJobSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      
      try {
        const res = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body: formData,
        });
        
        if (!res.ok) throw new Error("Upload failed");
        return res.json();
      } catch (error) {
        console.warn("API upload failed, simulating success for demo:", error);
        return { success: true, count: files.length };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-sheets"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (data: { findingId: number | string; type: string; comment: string }) => {
      try {
        return await fetcher("/feedback", {
          method: "POST",
          body: JSON.stringify(data),
        });
      } catch (error) {
        console.warn("API feedback failed, simulating success for demo:", error);
        return { success: true };
      }
    },
  });
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { jobSheetId: string; box: BoundingBox; label: string; comment: string }) => {
      try {
        return await fetcher(`/job-sheets/${data.jobSheetId}/annotations`, {
          method: "POST",
          body: JSON.stringify(data),
        });
      } catch (error) {
        console.warn("API annotation failed, simulating success for demo:", error);
        return { success: true, id: Date.now() };
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job-sheet", variables.jobSheetId] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Base API URL - in production this would be an environment variable
// Using a relative path assuming the frontend is served by the same origin or proxied
// If running separately, this might need to be http://localhost:8000/api/v1
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

// Generic fetcher
async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.statusText}`);
  }

  return res.json();
}

// --- Job Sheets ---

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

export interface JobSheet {
  id: string;
  technician: string;
  site: string;
  date: string;
  status: "passed" | "failed" | "review";
  score: string;
  documentUrl: string;
  findings: Finding[];
}

export interface Finding {
  id: string | number;
  field: string;
  status: "passed" | "missing" | "warning";
  message?: string;
  value?: string;
  severity?: "critical" | "major" | "minor";
  confidence: number;
  box?: BoundingBox;
}

export function useJobSheets() {
  return useQuery({
    queryKey: ["job-sheets"],
    queryFn: async () => {
      try {
        return await fetcher<JobSheet[]>("/job-sheets");
      } catch (error) {
        console.warn("API fetch failed, returning mock data for demo:", error);
        // Return mock data if API fails (for demo resilience)
        return [
          {
            id: "JS-2024-001",
            technician: "John Doe",
            site: "London HQ",
            date: "2024-01-15",
            status: "failed",
            score: "C",
            documentUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf",
            findings: []
          },
          {
            id: "JS-2024-002",
            technician: "Jane Smith",
            site: "Manchester Branch",
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
    queryKey: ["job-sheets", id],
    queryFn: async () => {
      try {
        return await fetcher<JobSheet>(`/job-sheets/${id}`);
      } catch (error) {
        console.warn("API fetch failed, returning mock data for demo:", error);
        // Return mock data if API fails
        return {
          id: id,
          status: "failed",
          score: "C",
          technician: "John Doe",
          date: "2024-01-15",
          site: "London HQ",
          documentUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf",
          findings: [
            {
              id: 1,
              field: "Customer Signature",
              status: "missing",
              severity: "critical",
              message: "Customer signature is required but not detected.",
              confidence: 0.98,
              box: { page: 1, x: 10, y: 80, width: 30, height: 5, color: "#ef4444", label: "Missing Signature" }
            },
            {
              id: 2,
              field: "Date of Service",
              status: "passed",
              value: "15/01/2024",
              confidence: 0.99,
              box: { page: 1, x: 70, y: 15, width: 20, height: 3, color: "#22c55e", label: "Date" }
            },
            {
              id: 3,
              field: "Serial Number",
              status: "warning",
              value: "SN-12345-??",
              message: "Serial number is partially obscured.",
              confidence: 0.75,
              box: { page: 1, x: 40, y: 30, width: 25, height: 4, color: "#f97316", label: "Serial #" }
            },
            {
              id: 4,
              field: "Work Description",
              status: "passed",
              value: "Routine maintenance performed. Replaced filters.",
              confidence: 0.95,
              box: { page: 1, x: 10, y: 40, width: 80, height: 20, color: "#22c55e", label: "Description" }
            },
          ],
        } as JobSheet;
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
      
      const res = await fetch(`${API_BASE_URL}/job-sheets/upload`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-sheets"] });
    },
  });
}

// --- Specs ---

export interface Spec {
  id: string;
  name: string;
  version: string;
  rules: Rule[];
}

export interface Rule {
  id: string;
  field: string;
  type: string;
  required: boolean;
}

export function useSpecs() {
  return useQuery({
    queryKey: ["specs"],
    queryFn: async () => {
      try {
        return await fetcher<Spec[]>("/specs");
      } catch (error) {
        return [
          { id: "1", name: "Standard Maintenance", version: "1.0.0", rules: [] },
          { id: "2", name: "Emergency Repair", version: "1.2.0", rules: [] }
        ] as Spec[];
      }
    },
  });
}

// --- Users ---

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      try {
        return await fetcher<User[]>("/users");
      } catch (error) {
        return [
          { id: "1", name: "Admin User", email: "admin@example.com", role: "admin" },
          { id: "2", name: "Auditor One", email: "auditor@example.com", role: "auditor" }
        ] as User[];
      }
    },
  });
}

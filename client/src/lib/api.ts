import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Base API URL - in production this would be an environment variable
const API_BASE_URL = "/api/v1";

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
    queryFn: () => fetcher<JobSheet[]>("/job-sheets"),
  });
}

export function useJobSheet(id: string) {
  return useQuery({
    queryKey: ["job-sheets", id],
    queryFn: () => fetcher<JobSheet>(`/job-sheets/${id}`),
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
    queryFn: () => fetcher<Spec[]>("/specs"),
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
    queryFn: () => fetcher<User[]>("/users"),
  });
}

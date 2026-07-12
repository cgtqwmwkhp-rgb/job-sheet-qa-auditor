/**
 * Toast Notification Helpers
 * 
 * Standardized toast notifications for common operations.
 * Provides consistent messaging and styling across the app.
 * 
 * @module toastHelpers
 * @see {@link https://sonner.emilkowal.ski/} Sonner documentation
 * 
 * @example
 * import { showSuccessToast, showErrorToast } from '@/lib/toastHelpers';
 * 
 * // Simple success
 * showSuccessToast("Settings saved");
 * 
 * // Success with description
 * showSuccessToast("User created", "john@example.com has been added");
 * 
 * // Error with context
 * showMutationErrorToast(error, "save settings");
 */

import { toast } from "sonner";

/**
 * Success toast with standard styling
 */
export function showSuccessToast(message: string, description?: string) {
  return toast.success(message, {
    description,
    duration: 4000,
  });
}

/**
 * Error toast with standard styling
 */
export function showErrorToast(message: string, description?: string) {
  return toast.error(message, {
    description,
    duration: 6000, // Longer duration for errors
  });
}

/**
 * Info toast with standard styling
 */
export function showInfoToast(message: string, description?: string) {
  return toast.info(message, {
    description,
    duration: 4000,
  });
}

/**
 * Warning toast with standard styling
 */
export function showWarningToast(message: string, description?: string) {
  return toast.warning(message, {
    description,
    duration: 5000,
  });
}

/**
 * Loading toast that can be dismissed manually
 */
export function showLoadingToast(message: string, description?: string) {
  return toast.loading(message, {
    description,
  });
}

/**
 * Promise toast - shows loading, then success or error based on promise resolution
 */
export function showPromiseToast<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }
) {
  return toast.promise(promise, messages);
}

/**
 * Upload success toast
 */
export function showUploadSuccessToast(fileName: string, count: number = 1) {
  if (count === 1) {
    return showSuccessToast("Upload successful", `"${fileName}" uploaded`);
  }
  return showSuccessToast(
    "Upload successful",
    `${count} files uploaded successfully`
  );
}

/**
 * Upload error toast
 */
export function showUploadErrorToast(fileName: string, error?: string) {
  return showErrorToast(
    "Upload failed",
    error || `Failed to upload "${fileName}"`
  );
}

/**
 * Save success toast
 */
export function showSaveSuccessToast(itemType: string = "Changes") {
  return showSuccessToast(`${itemType} saved`, "Your changes have been saved");
}

/**
 * Save error toast
 */
export function showSaveErrorToast(itemType: string = "Changes", error?: string) {
  return showErrorToast(
    `Failed to save ${itemType.toLowerCase()}`,
    error || "Please try again"
  );
}

/**
 * Delete success toast
 */
export function showDeleteSuccessToast(itemType: string, itemName?: string) {
  const message = itemName
    ? `${itemType} "${itemName}" deleted`
    : `${itemType} deleted`;
  return showSuccessToast("Deleted", message);
}

/**
 * Delete error toast
 */
export function showDeleteErrorToast(itemType: string, error?: string) {
  return showErrorToast(
    `Failed to delete ${itemType.toLowerCase()}`,
    error || "Please try again"
  );
}

/**
 * Permission error toast
 */
export function showPermissionErrorToast() {
  return showErrorToast(
    "Permission denied",
    "You don't have permission to perform this action"
  );
}

/**
 * Network error toast
 */
export function showNetworkErrorToast() {
  return showErrorToast(
    "Connection error",
    "Please check your internet connection and try again"
  );
}

/**
 * Generic mutation error toast from TRPCError
 */
export function showMutationErrorToast(error: any, actionName: string = "operation") {
  const message = error?.message || `Failed to ${actionName}`;
  const description = error?.data?.zodError 
    ? "Please check your input"
    : undefined;
  return showErrorToast(message, description);
}

/**
 * Copy to clipboard toast
 */
export function showCopySuccessToast(item: string = "Text") {
  return showSuccessToast(`${item} copied`, "Copied to clipboard");
}

/**
 * Batch operation success toast
 */
export function showBatchSuccessToast(count: number, action: string, itemType: string) {
  return showSuccessToast(
    `Batch ${action} successful`,
    `${count} ${itemType}(s) ${action}ed successfully`
  );
}

/**
 * Batch operation error toast
 */
export function showBatchErrorToast(count: number, action: string, itemType: string) {
  return showErrorToast(
    `Batch ${action} failed`,
    `Failed to ${action} ${count} ${itemType}(s)`
  );
}

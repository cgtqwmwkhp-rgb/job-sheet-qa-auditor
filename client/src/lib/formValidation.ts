/**
 * Form Validation Utilities
 * 
 * Client-side validation helpers with user-friendly error messages.
 * Provides immediate feedback before server validation.
 */

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate required field
 */
export function validateRequired(value: any, fieldName: string): string | null {
  if (value === null || value === undefined || value === "") {
    return `${fieldName} is required`;
  }
  if (typeof value === "string" && value.trim() === "") {
    return `${fieldName} cannot be empty`;
  }
  return null;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): string | null {
  if (!email) return null; // Use validateRequired separately
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Please enter a valid email address";
  }
  return null;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): string | null {
  if (!password) return null; // Use validateRequired separately
  
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

/**
 * Validate string length
 */
export function validateLength(
  value: string,
  min?: number,
  max?: number,
  fieldName: string = "Field"
): string | null {
  if (!value) return null;
  
  if (min !== undefined && value.length < min) {
    return `${fieldName} must be at least ${min} characters`;
  }
  if (max !== undefined && value.length > max) {
    return `${fieldName} must be no more than ${max} characters`;
  }
  return null;
}

/**
 * Validate number range
 */
export function validateNumber(
  value: number,
  min?: number,
  max?: number,
  fieldName: string = "Value"
): string | null {
  if (typeof value !== "number" || isNaN(value)) {
    return `${fieldName} must be a valid number`;
  }
  
  if (min !== undefined && value < min) {
    return `${fieldName} must be at least ${min}`;
  }
  if (max !== undefined && value > max) {
    return `${fieldName} must be no more than ${max}`;
  }
  return null;
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    new URL(url);
    return null;
  } catch {
    return "Please enter a valid URL (e.g., https://example.com)";
  }
}

/**
 * Validate file size
 */
export function validateFileSize(
  file: File,
  maxSizeMB: number
): string | null {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `File size must be less than ${maxSizeMB}MB`;
  }
  return null;
}

/**
 * Validate file type
 */
export function validateFileType(
  file: File,
  allowedTypes: string[]
): string | null {
  const fileType = file.type || "";
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
  
  const isAllowed = allowedTypes.some((type) => {
    if (type.startsWith(".")) {
      return fileExt === type.slice(1);
    }
    return fileType === type || fileType.startsWith(type + "/");
  });
  
  if (!isAllowed) {
    return `File type not allowed. Accepted types: ${allowedTypes.join(", ")}`;
  }
  return null;
}

/**
 * Validate phone number (basic)
 */
export function validatePhoneNumber(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, "");
  
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return "Please enter a valid phone number";
  }
  return null;
}

/**
 * Validate date is not in the past
 */
export function validateFutureDate(date: Date | string, fieldName: string = "Date"): string | null {
  const inputDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  
  if (inputDate < now) {
    return `${fieldName} must be in the future`;
  }
  return null;
}

/**
 * Validate date range
 */
export function validateDateRange(
  startDate: Date | string,
  endDate: Date | string
): string | null {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  
  if (start >= end) {
    return "End date must be after start date";
  }
  return null;
}

/**
 * Validate matches another field (e.g., password confirmation)
 */
export function validateMatch(
  value: string,
  matchValue: string,
  fieldName: string = "Field"
): string | null {
  if (value !== matchValue) {
    return `${fieldName} does not match`;
  }
  return null;
}

/**
 * Validate array has minimum items
 */
export function validateArrayMinLength(
  array: any[],
  min: number,
  itemName: string = "item"
): string | null {
  if (!Array.isArray(array) || array.length < min) {
    return `Please select at least ${min} ${itemName}${min > 1 ? "s" : ""}`;
  }
  return null;
}

/**
 * Composite validator - run multiple validations
 */
export function validateField(
  value: any,
  validators: Array<(value: any) => string | null>
): string | null {
  for (const validator of validators) {
    const error = validator(value);
    if (error) return error;
  }
  return null;
}

/**
 * Validate entire form
 */
export function validateForm<T extends Record<string, any>>(
  values: T,
  validators: Partial<Record<keyof T, (value: any) => string | null>>
): ValidationResult {
  const errors: Record<string, string> = {};
  let valid = true;
  
  for (const [field, validator] of Object.entries(validators)) {
    if (validator) {
      const error = validator(values[field as keyof T]);
      if (error) {
        errors[field] = error;
        valid = false;
      }
    }
  }
  
  return { valid, errors };
}

/**
 * Custom validation rule builder
 */
export function createValidator(
  testFn: (value: any) => boolean,
  errorMessage: string
): (value: any) => string | null {
  return (value: any) => {
    if (!testFn(value)) {
      return errorMessage;
    }
    return null;
  };
}

/**
 * Async validator (e.g., check if username exists)
 */
export async function validateAsync<T>(
  value: T,
  validatorFn: (value: T) => Promise<string | null>
): Promise<string | null> {
  try {
    return await validatorFn(value);
  } catch (error) {
    return "Validation failed. Please try again.";
  }
}

/**
 * Debounced validator for real-time validation
 */
export function createDebouncedValidator<T>(
  validator: (value: T) => string | null,
  delay: number = 300
): (value: T, callback: (error: string | null) => void) => void {
  let timeout: NodeJS.Timeout;
  
  return (value: T, callback: (error: string | null) => void) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const error = validator(value);
      callback(error);
    }, delay);
  };
}

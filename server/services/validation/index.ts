/**
 * Validation Service Module
 *
 * Provides field validation against specification rules.
 */

export * from "./types";
export * from "./validator";
export * from "./reviewQueue";
export {
  goldSpecToValidationRules,
  extractedFieldsToMap,
  validationFindingsToAnalyzer,
  runDeterministicValidation,
  canPromoteAutoPass,
} from "./goldSpecBridge";

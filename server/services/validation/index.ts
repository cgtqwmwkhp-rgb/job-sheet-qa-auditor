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
  findingsBlockAutoPass,
  AUTO_PASS_BLOCKING_RULE_IDS,
} from "./goldSpecBridge";

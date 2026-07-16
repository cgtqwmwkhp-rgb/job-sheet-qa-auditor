export {
  verifyPartsCatalogWeb,
  isPartsWebVerifyEnabled,
  FEATURE_PARTS_WEB_VERIFY,
  PARTS_CATALOG_RULE_PREFIX,
  MAX_PARTS_CATALOG_LINES,
  MAX_PARTS_CATALOG_EVIDENCE_URLS,
  toPersistedPartsCatalogLineResults,
  linesFromPersistedCatalogResults,
  patchReportJsonPartsCatalog,
  coercePersistedPartsCatalogLineResults,
} from "./verify";
export {
  buildPartsCatalogQuery,
  searchExaPartsCatalog,
  EXA_API_KEY_ENV,
  EXA_SEARCH_URL,
  EXA_SEARCH_TIMEOUT_MS,
  PARTS_OEM_ALLOWLIST_DOMAINS,
  ExaClientError,
  type ExaFetch,
} from "./exaClient";
export { scorePartsCatalogMatch } from "./score";
export type {
  PartsCatalogVerifyOutcome,
  ExaSearchResult,
  ExaSearchResponse,
  PartsCatalogLineVerifyResult,
  PartsCatalogPersistedLineResult,
  PartsCatalogVerifySignals,
  PartsCatalogVerifyResult,
} from "./types";

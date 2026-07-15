export {
  verifyPartsCatalogWeb,
  isPartsWebVerifyEnabled,
  FEATURE_PARTS_WEB_VERIFY,
  PARTS_CATALOG_RULE_PREFIX,
  MAX_PARTS_CATALOG_LINES,
} from "./verify";
export {
  buildPartsCatalogQuery,
  searchExaPartsCatalog,
  EXA_API_KEY_ENV,
  EXA_SEARCH_URL,
  EXA_SEARCH_TIMEOUT_MS,
  ExaClientError,
  type ExaFetch,
} from "./exaClient";
export { scorePartsCatalogMatch } from "./score";
export type {
  PartsCatalogVerifyOutcome,
  ExaSearchResult,
  ExaSearchResponse,
  PartsCatalogLineVerifyResult,
  PartsCatalogVerifySignals,
  PartsCatalogVerifyResult,
} from "./types";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract registry. Aggregates all site-service contract schemas into a
  single CONTRACTS array and exports a getContractById helper for lookup.
</purpose>
<non-goals>
  <item>Does not define contract schemas — each lives in its own .contract.ts file.</item>
  <item>Does not perform validation — that lives in contract-validator.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract registry with 7 site-service contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { contract as sendMessageContract } from "./send-message.contract.ts";
import { contract as integrationRouteContract } from "./integration-route.contract.ts";
import { contract as healthContract } from "./health.contract.ts";
import { contract as rateFetchContract } from "./rate-fetch.contract.ts";
import { contract as maturityScoreContract } from "./maturity-score.contract.ts";
import { contract as matomoProxyContract } from "./matomo-proxy.contract.ts";
import { contract as telegramAlertContract } from "./telegram-alert.contract.ts";

export interface ContractDefinition {
  id: string;
  name: string;
  direction: string;
  version: number;
  request: z.ZodType;
  response: z.ZodType;
  description: string;
}

export const CONTRACTS: ContractDefinition[] = [
  sendMessageContract,
  integrationRouteContract,
  healthContract,
  rateFetchContract,
  maturityScoreContract,
  matomoProxyContract,
  telegramAlertContract,
];

export function getContractById(id: string): ContractDefinition | undefined {
  return CONTRACTS.find((c) => c.id === id);
}

export {
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  type SendMessageRequest,
  type SendMessageResponse,
} from "./send-message.contract.ts";
export {
  IntegrationRouteRequestSchema,
  IntegrationRouteResponseSchema,
  type IntegrationRouteRequest,
  type IntegrationRouteResponse,
} from "./integration-route.contract.ts";
export {
  HealthRequestSchema,
  HealthResponseSchema,
  type HealthRequest,
  type HealthResponse,
} from "./health.contract.ts";
export {
  RateFetchRequestSchema,
  RateFetchResponseSchema,
  type RateFetchRequest,
  type RateFetchResponse,
} from "./rate-fetch.contract.ts";
export {
  MaturityScoreRequestSchema,
  MaturityScoreResponseSchema,
  type MaturityScoreRequest,
  type MaturityScoreResponse,
} from "./maturity-score.contract.ts";
export {
  MatomoProxyRequestSchema,
  MatomoProxyResponseSchema,
  type MatomoProxyRequest,
  type MatomoProxyResponse,
} from "./matomo-proxy.contract.ts";
export {
  TelegramAlertRequestSchema,
  TelegramAlertResponseSchema,
  type TelegramAlertRequest,
  type TelegramAlertResponse,
} from "./telegram-alert.contract.ts";

import type { ClaimResponse } from "../api/wire-types.js";

export interface ExternalClaimRequest {
  workerId?: string;
  workerType?: string;
  discipline?: string;
  role: string;
  flow?: string;
}

export interface ExternalClaimResponse {
  workerId: string;
  claim: ClaimResponse;
  worker_notice?: string;
}

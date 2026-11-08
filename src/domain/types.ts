/** Shared domain types. Nothing in src/domain imports React or touches the browser. */

export interface Company {
  name: string;
  /** IANA zone. Every "which day / which month" decision is made in this zone. */
  timeZone: string;
  currency: 'USD';
  invoicePrefix: string;
  paymentTermsDays: number;
  address: { line1: string; city: string; region: string; postalCode: string; country: string };
}

export interface Member {
  id: string;
  name: string;
  role: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
}

export interface RateEntry {
  id: string;
  memberId: string;
  /** Local date (YYYY-MM-DD) in the company zone from which this rate applies. */
  effectiveFrom: string;
  hourlyRateCents: number;
}

export interface TimeEntry {
  id: string;
  memberId: string;
  projectId: string;
  /** UTC instant (ISO 8601 with Z). */
  startedAt: string;
  minutes: number;
  description: string;
}

/** Name and address of the contractor issuing the invoice (all fictional in the seed). */
export interface BillingProfile {
  memberId: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface Dataset {
  company: Company;
  members: Member[];
  projects: Project[];
  rates: RateEntry[];
  timeEntries: TimeEntry[];
  billingProfiles: BillingProfile[];
}

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DomainError';
  }
}

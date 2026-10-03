export type Role = "organizer" | "employee";

export interface Match {
  id: number;
  side_a: string;
  side_b: string;
  starts_at: string;
  created_at: string;
}

export interface CreateMatchInput {
  side_a: string;
  side_b: string;
  /** ISO 8601 timestamp in UTC. */
  starts_at: string;
}

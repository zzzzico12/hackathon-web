export type OnlineStatus = "ONLINE" | "OFFLINE" | "HYBRID";
export type PrizeBucket = "NO_PRIZE" | "SMALL" | "LARGE";
export type Status = "UPCOMING" | "PAST";

export interface Hackathon {
  source_id: string;
  title: string;
  source_url: string;
  source_name: string;
  start_date: string;
  end_date: string;
  entry_deadline?: string;
  description?: string;
  location?: string;
  is_online: boolean;
  online_status: OnlineStatus;
  prize_amount: number;
  prize_bucket: PrizeBucket;
  themes: string[];
  is_beginner_friendly: boolean;
  status: Status;
  created_at: string;
}

export interface HackathonListResponse {
  items: Hackathon[];
  count: number;
  next_token: string | null;
}

export interface FilterParams {
  status?: Status | "ALL";
  online?: "true" | "false";
  prize?: PrizeBucket;
  beginner?: "true";
  theme?: string;
  limit?: number;
  next_token?: string;
}

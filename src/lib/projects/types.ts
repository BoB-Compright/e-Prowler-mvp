export type ShareStatus = "active" | "disabled" | "revoked";

export interface Project {
  id: string;
  name: string;
  pmName: string;
  pmEmail: string;
  shareToken: string;
  shareStatus: ShareStatus;
  createdAt: string;
}

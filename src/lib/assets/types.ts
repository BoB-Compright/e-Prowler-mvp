export type AssetType = "repo" | "server";
export type ServerAuthType = "password" | "key";

export interface Asset {
  id: string;
  type: AssetType;
  projectId: string | null;
  displayName: string;
  repoUrl: string | null;
  hostIp: string | null;
  hostname: string | null;
  sshPort: number | null;
  authType: ServerAuthType | null;
  username: string | null;
  encryptedSecret: string | null;
  createdAt: string;
}

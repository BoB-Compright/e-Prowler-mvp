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
  os: string | null;
  owner: string | null;
  category: string | null; // 서버 자산 종류 (OS/WEB/WAS/DB)
  vendor: string | null; // 종류별 제조사
  dockerfilePath: string | null;
  scanInputs: string | null; // 벤더 사전 입력값 저장 원본(JSON, secret은 암호화됨). 미설정 시 null.
  createdAt: string;
}

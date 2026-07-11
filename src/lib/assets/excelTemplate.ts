import * as XLSX from "xlsx";

const REPO_ROWS = [
  ["display_name", "repo_url", "os", "owner"],
  ["nh-pay-gateway", "https://github.com/nh/pay-gateway", "", ""],
];

const SERVER_ROWS = [
  ["display_name", "host_ip", "hostname", "ssh_port", "auth_type", "username", "secret", "os", "owner", "category", "vendor"],
  ["web-01", "10.0.0.5", "web-01.internal", 22, "password", "admin", "changeme", "Ubuntu 22.04", "홍길동", "WEB", "Nginx"],
];

export function buildAssetImportTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(REPO_ROWS), "repo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(SERVER_ROWS), "server");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

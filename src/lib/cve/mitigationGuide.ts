// CVE 영향 패키지의 일반 업그레이드 가이드(배포판 패키지매니저별 명령). 정확한 fixed-version은
// 저장하지 않으므로 "안전한 버전으로 업그레이드" 수준의 실행 가능한 명령을 제시한다.
export function buildUpgradeGuide(packageNames: string[]): { apt: string; yum: string } {
  const pkgs = Array.from(new Set(packageNames.filter(Boolean)));
  const list = pkgs.join(" ");
  const apt = pkgs.length
    ? `sudo apt-get update && sudo apt-get install --only-upgrade ${list}`
    : "sudo apt-get update && sudo apt-get upgrade";
  const yum = pkgs.length ? `sudo yum update ${list}` : "sudo yum update";
  return { apt, yum };
}

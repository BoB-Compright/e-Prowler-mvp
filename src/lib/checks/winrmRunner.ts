// WinRM 기반 Windows 점검 실행 진입점(스캐폴드). #4에서 Windows 벤더 팩은
// executionPath "windows"로 등록돼 evaluatePack이 결과를 "Windows 호스트 연결 대기"
// review로 단락하므로, 이 러너는 아직 파이프라인에서 호출되지 않는다. Windows 호스트/
// WinRM 자격증명이 확보되면 여기서 ansible(community.windows/winrm) 또는 직접 WinRM으로
// 증거를 수집하도록 구현한다(별도 사이클).
export const WINRM_NOT_IMPLEMENTED =
  "WinRM 실행 경로 미구현: Windows 호스트/자격증명 확보 후 구현 예정";

export async function runWinrmChecks(): Promise<never> {
  throw new Error(WINRM_NOT_IMPLEMENTED);
}

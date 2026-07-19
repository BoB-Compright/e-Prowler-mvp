// PM 공유 링크 이메일 발송(옵션 A, #81): 서버 발송 없이 담당자 본인 메일
// 클라이언트를 여는 mailto: 링크를 만든다. 공유 비밀번호는 링크와 같은
// 채널에 두지 않는 보안 원칙에 따라 본문에 포함하지 않는다.
export function buildShareMailto(input: {
  pmEmail: string;
  pmName: string;
  projectName: string;
  shareUrl: string;
}): string {
  const subject = `[NH-Guardian] ${input.projectName} 보안 점검 리포트 공유`;
  const body = [
    `${input.pmName}님, 안녕하세요.`,
    "",
    `NH-Guardian에서 '${input.projectName}' 프로젝트의 보안 점검 리포트를 공유드립니다.`,
    "",
    `열람 링크: ${input.shareUrl}`,
    "",
    "열람 비밀번호는 보안을 위해 이 메일에 포함하지 않았습니다. 별도 채널로 전달드리겠습니다.",
  ].join("\n");

  return (
    `mailto:${encodeURIComponent(input.pmEmail.trim())}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

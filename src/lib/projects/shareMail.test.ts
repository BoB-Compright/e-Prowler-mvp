import { describe, expect, it } from "vitest";
import { buildShareMailto } from "./shareMail";

const input = {
  pmEmail: "pm@nonghyup.com",
  pmName: "홍길동",
  projectName: "농협OO지주 IT인프라 운영",
  shareUrl: "http://localhost:3000/share/abc123",
};

describe("buildShareMailto (#81)", () => {
  it("addresses the mail to the PM", () => {
    const href = buildShareMailto(input);
    expect(href.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(href.slice("mailto:".length).split("?")[0])).toBe("pm@nonghyup.com");
  });

  it("puts the project name in the subject", () => {
    const href = buildShareMailto(input);
    const subject = new URLSearchParams(href.split("?")[1]).get("subject");
    expect(subject).toContain("농협OO지주 IT인프라 운영");
    expect(subject).toContain("NH-Guardian");
  });

  it("includes the share URL and PM name in the body", () => {
    const body = new URLSearchParams(buildShareMailto(input).split("?")[1]).get("body");
    expect(body).toContain("http://localhost:3000/share/abc123");
    expect(body).toContain("홍길동");
  });

  it("tells the recipient the password is intentionally not included", () => {
    const body = new URLSearchParams(buildShareMailto(input).split("?")[1]).get("body");
    expect(body).toContain("비밀번호");
    expect(body).toContain("포함하지 않");
  });

  it("encodes special characters so they cannot break the query string", () => {
    const href = buildShareMailto({ ...input, projectName: "A&B=팀 #2" });
    const subject = new URLSearchParams(href.split("?")[1]).get("subject");
    expect(subject).toContain("A&B=팀 #2");
  });

  it("trims surrounding whitespace from the email address", () => {
    const href = buildShareMailto({ ...input, pmEmail: "  pm@nonghyup.com  " });
    expect(decodeURIComponent(href.slice("mailto:".length).split("?")[0])).toBe("pm@nonghyup.com");
  });
});

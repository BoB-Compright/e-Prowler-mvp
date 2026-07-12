import { describe, expect, it } from "vitest";
import { mergeEvidenceTasks, renderTasksYaml } from "./playbook";

describe("mergeEvidenceTasks", () => {
  it("dedupes identical tasks by name", () => {
    const a = [{ name: "T1", raw: "echo 1" }];
    const b = [{ name: "T1", raw: "echo 1" }, { name: "T2", raw: "echo 2" }];
    expect(mergeEvidenceTasks([a, b]).map((t) => t.name)).toEqual(["T1", "T2"]);
  });
  it("throws on same name with different command", () => {
    const a = [{ name: "T1", raw: "echo 1" }];
    const b = [{ name: "T1", raw: "echo X" }];
    expect(() => mergeEvidenceTasks([a, b])).toThrow(/충돌: T1/);
  });
});

describe("renderTasksYaml", () => {
  it("renders a raw task block with changed_when false", () => {
    const yaml = renderTasksYaml([{ name: 'WEB-99: x', raw: "echo hi" }]);
    expect(yaml).toContain('- name: "WEB-99: x"');
    expect(yaml).toContain("ansible.builtin.raw:");
    expect(yaml).toContain("changed_when: false");
    expect(yaml).toContain("echo hi");
  });
});

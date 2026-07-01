import { describe, expect, it } from "vitest";
import { findTaskOutput } from "./ansibleRunner";

describe("findTaskOutput", () => {
  it("matches a task by its catalog id prefix", () => {
    const tasks = [
      { taskName: "C-01: runtime uid", stdout: "0\n" },
      { taskName: "U-16: /etc/passwd owner and mode", stdout: "root:root 644\n" },
    ];
    expect(findTaskOutput(tasks, "C-01")?.stdout).toBe("0\n");
    expect(findTaskOutput(tasks, "U-16")?.stdout).toBe("root:root 644\n");
    expect(findTaskOutput(tasks, "C-02")).toBeUndefined();
  });
});

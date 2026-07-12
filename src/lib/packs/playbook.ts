import type { PlaybookTask } from "./types";

// 여러 팩의 evidenceTasks를 name 기준으로 dedupe·병합한다. 같은 name에
// 다른 command가 등록되면 개발 시점에 드러나도록 예외로 조기 실패한다.
export function mergeEvidenceTasks(taskLists: PlaybookTask[][]): PlaybookTask[] {
  const byName = new Map<string, PlaybookTask>();
  for (const list of taskLists) {
    for (const task of list) {
      const existing = byName.get(task.name);
      if (existing) {
        if (existing.raw !== task.raw) throw new Error(`evidence task 충돌: ${task.name}`);
        continue;
      }
      byName.set(task.name, task);
    }
  }
  return [...byName.values()];
}

// PlaybookTask[]를 security-checks.yml에 append 가능한 task YAML 조각으로
// 렌더한다. raw 커맨드는 YAML block scalar(|)로 넣어 따옴표/특수문자를
// 이스케이프 없이 안전하게 담는다.
export function renderTasksYaml(tasks: PlaybookTask[]): string {
  return tasks
    .map((task) => {
      const indentedCmd = task.raw
        .split("\n")
        .map((line) => `          ${line}`)
        .join("\n");
      return [
        `    - name: ${JSON.stringify(task.name)}`,
        `      ansible.builtin.raw: |`,
        indentedCmd,
        `      changed_when: false`,
      ].join("\n");
    })
    .join("\n");
}

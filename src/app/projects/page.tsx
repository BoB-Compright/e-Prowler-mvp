import Link from "next/link";
import { listProjects } from "@/lib/projects/store";
import { ProjectForm } from "./ProjectForm";

export default async function ProjectsPage() {
  const projects = listProjects();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">프로젝트</h1>
      <ProjectForm />
      <ul className="mt-6 text-sm">
        {projects.map((project) => (
          <li key={project.id} className="border-b border-[var(--color-border)] py-2">
            <Link href={`/projects/${project.id}`} className="text-[var(--color-primary)]">{project.name}</Link>
            <span className="ml-2 text-[var(--color-muted)]">{project.pmName} · {project.pmEmail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

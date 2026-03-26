// components/WorkflowList.tsx
import { useEffect, useState } from "react";
import type { DefaultProject } from "../services/workflowService";
import { fetchDefaultProjects } from "../services/workflowService";

interface WorkflowListProps {
  onSelectWorkflow: (project: DefaultProject) => void;
  selectedWorkflowId?: string;
}

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const [projects, setProjects] = useState<DefaultProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDefaultProjects()
      .then((response) => setProjects(response.projects))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading projects...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="container-md w-75 d-flex flex-column gap-2 m-auto p-3">
      {projects.map((project) => (
        <button
          key={project.name}
          className="btn btn-outline-primary text-start w-100"
          onClick={() => onSelectWorkflow(project)}
        >
          <div className="fw-bold">{project.name}</div>
          <small className="text-muted">{project.files.length} files</small>
        </button>
      ))}
    </div>
  );
}

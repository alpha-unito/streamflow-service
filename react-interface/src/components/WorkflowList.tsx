// components/WorkflowList.tsx
import { useEffect, useState } from "react";
import type { Workflow } from "../types/workflow";
import { fetchWorkflows } from "../services/workflowService";

interface WorkflowListProps {
  onSelectWorkflow: (workflow: Workflow) => void;
  selectedWorkflowId?: string;
}

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflows()
      .then(setWorkflows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading workflows...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="container-md w-75 d-flex flex-column gap-2 m-auto">
      {workflows.map((workflow) => (
        <button
          key={workflow.id}
          className="btn btn-outline-primary text-start w-100"
          onClick={() => onSelectWorkflow(workflow)}
        >
          <div className="fw-bold">{workflow.name}</div>
          {workflow.description && (
            <small className="text-muted">{workflow.description}</small>
          )}
        </button>
      ))}
    </div>
  );
}

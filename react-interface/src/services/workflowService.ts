// services/workflowService.ts
import type { Workflow } from "../types/workflow"
import type { WorkflowDetails } from "../types/workflowDetails"

const API_BASE_URL = "http://130.192.100.196:8000";

export async function fetchWorkflows(): Promise<Workflow[]> {
  
  const response = await fetch(`${API_BASE_URL}/workflows`)

  if (!response.ok) {
    throw new Error("Failed to fetch workflows")
  }

  return response.json();
  
}

export async function fetchWorkflowDetails( workflowId: string ): Promise<WorkflowDetails> {
  
  const response = await fetch(
    `${API_BASE_URL}/workflows/${workflowId}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch workflow details")
  }

  return response.json();
}

export async function executeWorkflow(workflowName: string): Promise<void> {
  
  const response = await fetch(
    `${API_BASE_URL}/workflows/${workflowName}/execute`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error("Failed to execute workflow")
  }
}

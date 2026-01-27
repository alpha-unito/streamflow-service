// services/workflowService.ts
import type { Workflow } from "../types/workflow"
import type { WorkflowDetails } from "../types/workflowDetails"

const API_BASE_URL = "http://130.192.100.196:4646";

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

export async function uploadAndRunWorkflow(files: FileList, projectName: string): Promise<void> {
  const formData = new FormData();
  
  // Add project name to form data
  formData.append('projectName', projectName);
  
  // Add all files to form data
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  
  const response = await fetch(
    `${API_BASE_URL}/run/guest-0/${projectName}`, // TODO: replace guest-0 with actual user ID when auth is implemented
    { 
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    throw new Error("Failed to upload and run workflow");
  }
}

export async function executeExampleWorkflow(workflowName: string): Promise<void> {
  
  const response = await fetch(
    `${API_BASE_URL}/example_run/${workflowName}/guest-0`,
    { method: "GET" }
  )
  if (!response.ok) {
    alert("Example run failed: " + response.statusText);
  } else {
    alert("Example run started for " + workflowName);
  }
}

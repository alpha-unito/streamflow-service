// services/workflowService.ts
import type { Workflow } from "../types/workflow"
import type { WorkflowDetails } from "../types/workflowDetails"

const API_BASE_URL = "http://130.192.100.196:4646";

let currentUser: string | null = null;

export function setCurrentUser(username: string) {
  currentUser = username;
}

export function getCurrentUser(): string | null {
  return currentUser;
}

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

export async function uploadAndRunWorkflow(files: File[], projectName: string): Promise<any> {
  const formData = new FormData();
  
  // Add project name to form data
  formData.append('projectName', projectName);
  
  // Add all files to form data
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  
  const response = await fetch(
    `${API_BASE_URL}/run/${currentUser}/${projectName}`,
    { 
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    throw new Error("Failed to upload and run workflow");
  }
  
  return await response.json();
}

export async function executeExampleWorkflow(workflowName: string): Promise<any> {
  
  const response = await fetch(
    `${API_BASE_URL}/example_run/${workflowName}/${currentUser}`,
    { method: "GET" }
  )
  if (!response.ok) {
    alert("Example run failed: " + response.statusText);
    throw new Error("Failed to start example workflow");
  } else {
    const result = await response.json();
    alert(`Example workflow started! Workflow ID: ${result.workflow_id}`);
    return result;
  }
}

export async function getRunningWorkflows(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/running_workflows`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch running workflows");
  }
  
  return await response.json();
}

// export async function getWorkflowLogs(logFilePath: string): Promise<string> {
//   // This would need to be implemented based on how you want to serve log files
//   // For now, return a placeholder
//   return "Log file access not implemented yet";
// }

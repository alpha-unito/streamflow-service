// services/workflowService.ts
import type { Workflow } from "../types/workflow"
// import type { WorkflowDetails } from "../types/workflowDetails"
import * as YAML from 'yaml'

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

// export async function fetchWorkflowDetails( workflowId: string ): Promise<WorkflowDetails> {
  
//   const response = await fetch(
//     `${API_BASE_URL}/workflows/${workflowId}`
//   );

//   if (!response.ok) {
//     throw new Error("Failed to fetch workflow details")
//   }

//   return response.json();
// }

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

export async function getRunningWorkflows(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/running_workflows`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch running workflows");
  }
  
  return await response.json();
}

export async function getWorkflowLogContent(username: string, projectName: string, logFilename: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/workflow_logs_content/${username}/${projectName}/${logFilename}`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch log content");
  }
  
  const data = await response.json();
  return data.content;
}

export function getWorkflowLogUrl(username: string, projectName: string, logFilename: string): string {
  return `${API_BASE_URL}/workflow_logs/${username}/${projectName}/${logFilename}`;
}

export function parseLogPath(logPath: string): { filename: string } | null {
  if (!logPath) return null;
  
  const filename = logPath.split('/').pop();
  return filename ? { filename } : null;
}

// Default Projects API functions
export interface DefaultProject {
  name: string;
  files: string[];
}

export interface DefaultProjectsResponse {
  projects: DefaultProject[];
  message?: string;
}

export async function fetchDefaultProjects(): Promise<DefaultProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/default_projects`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch default projects');
  }
  
  return response.json();
}

export async function downloadDefaultProject(projectName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/default_projects/${projectName}/download`);
  
  if (!response.ok) {
    throw new Error('Failed to download project');
  }
  
  // Get the file as a blob
  const blob = await response.blob();
  
  // Create a download link
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName}.zip`;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export interface DefaultProjectStreamflowResponse {
  project_name: string;
  streamflow_config: any;
  project_files: Record<string, {
    type: 'yaml' | 'text' | 'cwl' | 'binary' | 'error' | 'script';
    content: any;
  }>;
}

export async function getDefaultProjectStreamflow(projectName: string): Promise<DefaultProjectStreamflowResponse> {
  const response = await fetch(`${API_BASE_URL}/default_projects/${projectName}/streamflow`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch project streamflow configuration');
  }
  
  return response.json();
}

export function getDefaultProjectImageUrl(projectName: string): string {
  return `${API_BASE_URL}/default_projects/${projectName}/image`;
}

export async function getDefaultProjectDescription(projectName: string): Promise<{ content: string; filename: string }> {
  const response = await fetch(`${API_BASE_URL}/default_projects/${projectName}/description`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch project description');
  }
  
  return response.json();
}

export async function downloadWorkflowOutput(username: string, projectName: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/workflow_output/${encodeURIComponent(username)}/${encodeURIComponent(projectName)}/download`,
  );

  if (!response.ok) {
    const fallback = 'Failed to download workflow output';
    try {
      const data = await response.json();
      throw new Error(data?.detail || fallback);
    } catch {
      throw new Error(fallback);
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName}_output.zip`;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function executeModifiedConfig(projectName: string, projectData: DefaultProjectStreamflowResponse): Promise<any> {
  if (!currentUser) {
    throw new Error('No user set. Please set a user first.');
  }

  // Create FormData to send all files
  const formData = new FormData();
  
  // Convert each file back to its original format
  for (const [filePath, fileData] of Object.entries(projectData.project_files)) {
    let fileContent: string;
    
    switch (fileData.type) {
      case 'yaml':
        // Convert YAML objects back to YAML string
        const doc = new YAML.Document();
        doc.contents = fileData.content;
        fileContent = doc.toString();
        break;
      
      case 'text':
      case 'cwl':
      case 'script':
        // Text files remain as text
        fileContent = fileData.content;
        break;
      
      case 'binary':
      case 'error':
        // Skip binary files and error files
        continue;
      
      default:
        fileContent = String(fileData.content);
    }
    
    // Create File object with the correct path structure
    const file = new File([fileContent], filePath, { 
      type: fileData.type === 'yaml' ? 'application/x-yaml' : 'text/plain' 
    });
    
    formData.append('files', file);
  }
  
  const response = await fetch(
    `${API_BASE_URL}/run/${currentUser}/${projectName}`,
    { 
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    throw new Error("Failed to execute modified configuration");
  }
  
  return await response.json();
}

// export async function getWorkflowLogs(logFilePath: string): Promise<string> {
//   // This would need to be implemented based on how you want to serve log files
//   // For now, return a placeholder
//   return "Log file access not implemented yet";
// }

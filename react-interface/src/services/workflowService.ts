// services/workflowService.ts
import type { Workflow } from "../types/workflow";

const API_BASE_URL = "http://localhost:8000";

export async function fetchWorkflows(): Promise<Workflow[]> {
  
  const response = await fetch(`${API_BASE_URL}/workflows`);

  if (!response.ok) {
    throw new Error("Failed to fetch workflows");
  }

  return response.json();
  
  // return JSON.parse(
  //   '[{"id": "wf-001","name": "Data Ingestion Pipeline","description": "Ingests raw data from external sources and stores it in the data lake.","version": "1.0.0"},{"id": "wf-002","name": "Data Cleaning Workflow","description": "Cleans, normalizes, and validates ingested datasets.","version": "1.2.3"},{"id": "wf-003","name": "Model Training","description": "Trains a machine learning model using prepared datasets.","version": "2.0.0"},{"id": "wf-004","name": "Model Evaluation","description": "Evaluates trained models and generates performance reports.","version": "1.1.0"},{"id": "wf-005","name": "Deployment Workflow","description": "Packages and deploys the model to the production environment.","version": "3.0.1"}]'
  // )
}

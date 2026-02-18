import { useState, useEffect } from 'react';
import { fetchDefaultProjects, getDefaultProjectStreamflow, executeModifiedConfig, type DefaultProject } from '../services/workflowService';

interface DefaultProjectSelectorProps {
  onProjectSelected?: (projectName: string, projectData: any) => void;
}

const DEPLOYMENT_OPTIONS = [
  { value: 'broadwell', label: 'broadwell' },
  { value: 'cascadelake', label: 'cascadelake' },
  { value: 'epito', label: 'epito' }
] as const;

export const DefaultProjectSelector = ({ onProjectSelected }: DefaultProjectSelectorProps) => {
  const [projects, setProjects] = useState<DefaultProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    loadDefaultProjects();  
  }, []);

  const loadDefaultProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchDefaultProjects();
      setProjects(response.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load default projects');
    } finally {
      setLoading(false);
    }
  };

  // Helper to get the first workflow with bindings
  const getWorkflowBindings = () => {
    if (!projectData?.streamflow_config?.workflows) return null;
    
    const workflows = projectData.streamflow_config.workflows;
    const workflowName = Object.keys(workflows).find(name => workflows[name]?.bindings);
    
    return workflowName ? {
      name: workflowName,
      bindings: workflows[workflowName].bindings
    } : null;
  };

  const handleDeploymentChange = (stepIndex: number, newDeployment: string) => {
    if (!projectData?.streamflow_config?.workflows) return;

    const updatedData = { ...projectData };
    const workflows = updatedData.streamflow_config.workflows;
    
    // Find the first workflow with bindings
    const workflowName = Object.keys(workflows).find(name => workflows[name]?.bindings);
    
    if (workflowName && workflows[workflowName].bindings[stepIndex]) {
      workflows[workflowName].bindings[stepIndex].target.deployment = newDeployment;
      
      // Update the streamflow file in project_files as well
      if (updatedData.project_files['streamflow.yml']) {
        updatedData.project_files['streamflow.yml'].content = updatedData.streamflow_config;
      }
      
      setProjectData(updatedData);
      
      // Notify parent component of the change
      if (onProjectSelected) {
        onProjectSelected(selectedProject, updatedData);
      }
    }
  };

  const handleExecute = async () => {
    if (!projectData || !newProjectName.trim()) {
      setError('Please enter a project name and ensure project data is loaded');
      return;
    }

    try {
      setExecuting(true);
      setError(null);
      
      const result = await executeModifiedConfig(newProjectName.trim(), projectData);
      alert(`Successfully started workflow! Workflow ID: ${result.workflow_id}`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute workflow';
      setError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleProjectSelect = async (projectName: string) => {
    if (!projectName) {
      setSelectedProject('');
      setProjectData(null);
      setNewProjectName('');
      return;
    }

    try {
      setSelectedProject(projectName);
      setError(null);
      
      // Set default project name based on selected project
      setNewProjectName(`${projectName}-modified`);
      
      // Fetch the complete project data
      const data = await getDefaultProjectStreamflow(projectName);
      setProjectData(data);
      
      // Notify parent component
      if (onProjectSelected) {
        onProjectSelected(projectName, data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project configuration');
      setSelectedProject('');
      setProjectData(null);
      setNewProjectName('');
    }
  };

  if (loading) {
    return (
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title mb-0">Default Projects</h3>
        </div>
        <div className="card-body">
          <div className="d-flex justify-content-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="card-header">
        <h3 className="card-title mb-0">Choose a Default Project</h3>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        
        <div className="mb-3">
          <label htmlFor="projectSelect" className="form-label">
            Select a default project to explore:
          </label>
          <select
            id="projectSelect"
            className="form-select"
            value={selectedProject}
            onChange={(e) => handleProjectSelect(e.target.value)}
          >
            <option value="">-- Select a project --</option>
            {projects.map((project) => (
              <option key={project.name} value={project.name}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <div className="mt-3">
            <h5>Project: {selectedProject}</h5>
            
            {projectData && (
              <div className="mt-3">
                <h6>Workflow Steps Configuration:</h6>
                {(() => {
                  const workflowData = getWorkflowBindings();
                  return workflowData?.bindings && (
                    <div className="mb-3">
                      <div className="list-group">
                        {workflowData.bindings.map((binding: any, index: number) => (
                        <div key={index} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <h6 className="mb-1">Step: {binding.step || `Step ${index + 1}`}</h6>
                              <p className="mb-1 text-muted">
                                Deployment: {binding.target?.deployment || 'N/A'}
                              </p>
                            </div>
                            <div className="d-flex align-items-center">
                              <label className="form-label me-2 mb-0">Deployment:</label>
                              <select 
                                className="form-select form-select-sm"
                                value={binding.target?.deployment || ''}
                                onChange={(e) => handleDeploymentChange(index, e.target.value)}
                                style={{ width: 'auto', minWidth: '120px' }}
                              >
                                <option value="">Select deployment</option>
                                {DEPLOYMENT_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Execution Form */}
                <div className="mt-4 p-3 border rounded" style={{ backgroundColor: '#f0f8ff' }}>
                  <h6>Execute Modified Configuration</h6>
                  <div className="row g-3">
                    <div className="col-md-8">
                      <label htmlFor="projectName" className="form-label">New Project Name:</label>
                      <input
                        type="text"
                        id="projectName"
                        className="form-control"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Enter project name for execution"
                        disabled={executing}
                      />
                    </div>
                    <div className="col-md-4 d-flex align-items-end">
                      <button 
                        className="btn btn-primary w-100" 
                        onClick={handleExecute}
                        disabled={executing || !newProjectName.trim()}
                      >
                        {executing ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                            Executing...
                          </>
                        ) : (
                          'Execute'
                        )}
                      </button>
                    </div>
                  </div>
                  <small className="text-muted">
                    This will create a new workflow with your modified deployment configurations and all project files.
                  </small>
                </div>
                
                <h6 className="mt-3">Raw Streamflow Configuration:</h6>
                <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fa', maxHeight: '400px', overflow: 'auto' }}>
                  <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(projectData.streamflow_config)}
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-3">
              <h6>Project Files:</h6>
              <ul className="list-group">
                {projectData ? (
                  Object.keys(projectData.project_files).map((filePath, index) => (
                    <li key={index} className="list-group-item py-1">
                      <small>
                        {filePath} 
                        <span className="badge bg-secondary ms-2">
                          {projectData.project_files[filePath].type}
                        </span>
                      </small>
                    </li>
                  ))
                ) : (
                  projects
                    .find(p => p.name === selectedProject)
                    ?.files.map((file, index) => (
                      <li key={index} className="list-group-item py-1">
                        <small>{file}</small>
                      </li>
                    ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
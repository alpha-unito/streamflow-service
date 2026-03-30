// components/WorkflowDetails.tsx
import { useEffect, useState } from "react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DefaultProject, DefaultProjectStreamflowResponse } from "../services/workflowService"
import { getDefaultProjectStreamflow, executeModifiedConfig as execModifiedConfig, getDefaultProjectImageUrl, getDefaultProjectDescription } from "../services/workflowService"
import { WorkflowStatus } from "./WorkflowStatus"

interface WorkflowDetailsProps {
  workflow: DefaultProject
}

export function WorkflowDetails({ workflow }: WorkflowDetailsProps) {
  const [projectData, setProjectData] = useState<DefaultProjectStreamflowResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState<string>('')
  const [executionResult, setExecutionResult] = useState<{ workflow_id: string; status: string } | null>(null)
  const [description, setDescription] = useState<{ content: string; filename: string } | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<boolean>(false)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [showFileList, setShowFileList] = useState<boolean>(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setExecutionResult(null)
    setNewProjectName(`${workflow.name}-modified`)
    setImageError(false)
    setDescriptionError(null)
    setShowFileList(true)

    // Set image URL
    setImageUrl(getDefaultProjectImageUrl(workflow.name))

    // Fetch project streamflow data
    const fetchData = async () => {
      try {
        const [streamflowData, descriptionData] = await Promise.all([
          getDefaultProjectStreamflow(workflow.name),
          getDefaultProjectDescription(workflow.name)
        ])
        
        setProjectData(streamflowData)
        setDescription(descriptionData)
      } catch (err) {
        if (err instanceof Error) {
          // If only description fails, still show the project data
          try {
            const streamflowData = await getDefaultProjectStreamflow(workflow.name)
            setProjectData(streamflowData)
            setDescriptionError(err.message)
          } catch (streamflowErr) {
            setError(streamflowErr instanceof Error ? streamflowErr.message : 'Failed to load project data')
          }
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [workflow.name])

  // Helper to get the first workflow with bindings
  const getWorkflowBindings = () => {
    if (!projectData?.streamflow_config?.workflows) return null;
    
    const workflows = projectData.streamflow_config.workflows;
    const workflowName = Object.keys(workflows).find(name => workflows[name]?.bindings);
    
    if (!workflowName) return null;

    const bindings = workflows[workflowName].bindings;
    const stepBindings = Array.isArray(bindings)
      ? bindings
          .map((binding: any, index: number) => ({ binding, index }))
          .filter(({ binding }) => typeof binding?.step === 'string' && binding.step.length > 0)
      : [];

    return {
      name: workflowName,
      bindings,
      stepBindings,
    };
  };

  const handleDeploymentChange = (bindingIndex: number, newDeployment: string) => {
    if (!projectData?.streamflow_config?.workflows) return;

    const updatedData = { ...projectData };
    const workflows = updatedData.streamflow_config.workflows;
    
    // Find the first workflow with bindings
    const workflowName = Object.keys(workflows).find(name => workflows[name]?.bindings);
    
    if (workflowName && workflows[workflowName].bindings[bindingIndex]) {
      workflows[workflowName].bindings[bindingIndex].target.deployment = newDeployment;
      
      // Update the streamflow file in project_files as well
      if (updatedData.project_files['streamflow.yml']) {
        updatedData.project_files['streamflow.yml'].content = updatedData.streamflow_config;
      }
      
      setProjectData(updatedData);
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
      
      const result = await execModifiedConfig(newProjectName.trim(), projectData);
      setExecutionResult({
        workflow_id: result.workflow_id,
        status: result.status
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute workflow';
      setError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleCloseStatus = () => {
    setExecutionResult(null);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  if (loading) return <p>Select a project to see details...</p>
  if (error) return <p className="text-danger">{error}</p>
  if (!projectData) return null

  // If execution result is available, show the status component
  if (executionResult) {
    return (
      <div>
        <h3>{workflow.name}</h3>
        <WorkflowStatus 
          workflowId={executionResult.workflow_id} 
          projectName={newProjectName}
          onClose={handleCloseStatus}
        />
      </div>
    )
  }

  const workflowData = getWorkflowBindings();
  const deploymentOptions = Object.keys(projectData.streamflow_config?.deployments || {})
    .sort()
    .map((deploymentName) => ({ value: deploymentName, label: deploymentName }));

  return (
    <div>
      <div className="row h-100">
        <div className="col-12">
          {/* <h3>{workflow.name}</h3> */}
          
          {/* Workflow Overview Section */}
          <div className="mb-4">
            <h5>Workflow Overview</h5>
            <div className="row">
              {/* Workflow Image */}
              <div className="col-md-6">
                <div className="border rounded p-3" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imageError ? (
                    <div className="text-muted text-center">
                      <div style={{ fontSize: '3rem' }}>📊</div>
                      <p>No workflow diagram available</p>
                    </div>
                  ) : (
                    <img 
                      src={imageUrl || ''} 
                      alt={`${workflow.name} workflow diagram`}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={handleImageError}
                    />
                  )}
                </div>
              </div>
              
              {/* Workflow Description */}
              <div className="col-md-6">
                <div className="border rounded p-3" style={{ height: '400px', overflow: 'auto' }}>
                  {descriptionError ? (
                    <div className="text-muted">
                      <p>Failed to load description: {descriptionError}</p>
                      <p>No description available for this workflow.</p>
                    </div>
                  ) : description ? (
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children, ...props }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                              {children}
                            </a>
                          )
                        }}
                      >
                        {description.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-muted">
                      <p>Loading description...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Project Files */}
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Project Files:</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowFileList((prev) => !prev)}
              >
                {showFileList ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {showFileList && (
              <ul className="list-group">
                {Object.keys(projectData.project_files).map((filePath, index) => (
                  <li key={index} className="list-group-item py-1">
                    <small>
                      {filePath}
                      <span className="badge bg-secondary ms-2">
                        {projectData.project_files[filePath].type}
                      </span>
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Deployment Configuration */}
          {workflowData?.stepBindings && workflowData.stepBindings.length > 0 && (
            <div className="mb-4">
              <h5>Workflow Steps Configuration:</h5>
              <div className="list-group">
                {workflowData.stepBindings.map(({ binding, index }: { binding: any; index: number }, stepOrder: number) => (
                  <div key={index} className="list-group-item">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-1">Step: {binding.step || `Step ${stepOrder + 1}`}</h6>
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
                          {binding.target?.deployment && !deploymentOptions.some((option) => option.value === binding.target.deployment) && (
                            <option value={binding.target.deployment}>{binding.target.deployment} (current)</option>
                          )}
                          {deploymentOptions.map((option) => (
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
          )}

          {/* Execution Form */}
          <div className="p-3 border rounded" style={{ backgroundColor: '#f0f8ff' }}>
            <h5>Execute Project</h5>
            <div className="row g-3 align-items-end">
              <div className="col-md-8">
                <label htmlFor="projectName" className="form-label">Project Name:</label>
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
              <div className="col-md-4">
                <button 
                  className="btn btn-success w-100" 
                  onClick={handleExecute}
                  disabled={executing || !newProjectName.trim()}
                >
                  {executing ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Executing...
                    </>
                  ) : (
                    'Execute Project'
                  )}
                </button>
              </div>
            </div>
            <small className="text-muted">
              This will create a new workflow with your configured deployment settings and all project files.
            </small>
          </div>

          {/* Raw streamflow in json*/}
          {/* <div className="mt-4">
            <h5>Raw Streamflow Configuration:</h5>
            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fa', maxHeight: '400px', overflow: 'auto' }}>
              <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', textAlign: 'left' }}>
                {JSON.stringify(projectData.streamflow_config, null, 2)}
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  )
}

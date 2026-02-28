// components/WorkflowStatus.tsx
import { useEffect, useState } from "react"
import { getRunningWorkflows, getCurrentUser, getWorkflowLogContent, getWorkflowLogUrl, parseLogPath } from "../services/workflowService"

interface WorkflowStatusProps {
  workflowId: string
  projectName: string
  onClose: () => void
}

interface WorkflowStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  stepId?: string
}

export function WorkflowStatus({ workflowId, projectName, onClose }: WorkflowStatusProps) {
  const [status, setStatus] = useState<'running' | 'completed' | 'failed' | 'unknown'>('running')
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { name: 'Starting Workflow', status: 'running' },
    { name: 'Building Execution Plan', status: 'pending' },
    { name: 'Deploying Environments', status: 'pending' },
    { name: 'Executing Steps', status: 'pending' },
    { name: 'Cleanup & Results', status: 'pending' }
  ])
  const [detailedSteps, setDetailedSteps] = useState<WorkflowStep[]>([])
  const [logUrl, setLogUrl] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const response = await getRunningWorkflows()
        const workflowStatus = response.running_workflows[workflowId]
        
        if (workflowStatus) {
          setStatus(workflowStatus)
          
          // Set log URL if available
          const logPath = response.workflow_logs[workflowId]
          if (logPath) {
            const username = getCurrentUser()
            const logInfo = parseLogPath(logPath)
            
            if (username && logInfo) {
              const logUrl = getWorkflowLogUrl(username, projectName, logInfo.filename)
              setLogUrl(logUrl)
              
              // Fetch and parse log content
              try {
                const content = await getWorkflowLogContent(username, projectName, logInfo.filename)
                setLogContent(content)
                parseLogAndUpdateSteps(content, workflowStatus)
              } catch (logErr) {
                console.error('Failed to fetch log content:', logErr)
              }
            }
          }
          
          // Update basic step statuses based on workflow status
          if (!logContent) {
            updateBasicStepStatuses(workflowStatus)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch workflow status')
      }
    }

    // Poll every 2 seconds, but stop polling if workflow is in terminal state
    pollStatus()
    const interval = setInterval(() => {
      // Stop polling if workflow has completed or failed
      if (status === 'completed' || status === 'failed') {
        clearInterval(interval)
        return
      }
      pollStatus()
    }, 2000)
    
    return () => clearInterval(interval)
  }, [workflowId, projectName, logContent, status])

  const parseLogAndUpdateSteps = (content: string, workflowStatus: string) => {
    const lines = content.split('\n')
    const deploymentSteps: { [key: string]: string } = {}
    const workflowSteps: { [key: string]: string } = {}
    const detailedStepsList: WorkflowStep[] = []
    
    let buildingPlan = false
    let executingWorkflow = false
    let workflowCompleted = false
    let allDeploymentsDiscovered = new Set<string>()
    let allStepsDiscovered = new Set<string>()
    
    // First pass: discover all deployments and steps to show them from the beginning
    for (const line of lines) {
      // Discover deployments
      if (line.includes('DEPLOYING ')) {
        const deploymentMatch = line.match(/DEPLOYING\s+(\S+)/)
        if (deploymentMatch) {
          allDeploymentsDiscovered.add(deploymentMatch[1])
        }
      }
      
      // Discover workflow steps
      if (line.includes('EXECUTING step ')) {
        const stepMatch = line.match(/EXECUTING step\s+(\S+)/)
        if (stepMatch) {
          allStepsDiscovered.add(stepMatch[1])
        }
      }
    }
    
    // Initialize all discovered deployments and steps as not-started
    allDeploymentsDiscovered.forEach(deployment => {
      deploymentSteps[deployment] = 'not-started'
      deploymentSteps[`undeploy_${deployment}`] = 'not-started'
    })
    allStepsDiscovered.forEach(step => {
      workflowSteps[step] = 'not-started'
    })
    
    // Second pass: update statuses based on log content
    for (const line of lines) {
      // Building execution plan
      if (line.includes('Building workflow execution plan')) {
        buildingPlan = true
      } else if (line.includes('COMPLETED building of workflow execution plan')) {
        buildingPlan = false
      }
      
      // Executing workflow
      if (line.includes('EXECUTING workflow')) {
        executingWorkflow = true
      }
      
      // Workflow completion
      if (line.includes('COMPLETED workflow execution')) {
        workflowCompleted = true
      }
      
      // Deployment tracking
      if (line.includes('DEPLOYING ')) {
        const deploymentMatch = line.match(/DEPLOYING\s+(\S+)/)
        if (deploymentMatch) {
          const deployment = deploymentMatch[1]
          // Only set to running if it's not already completed
          if (deploymentSteps[deployment] !== 'completed') {
            deploymentSteps[deployment] = 'running'
          }
        }
      } else if (line.includes('COMPLETED deployment of ')) {
        const deploymentMatch = line.match(/COMPLETED deployment of\s+(\S+)/)
        if (deploymentMatch) {
          const deployment = deploymentMatch[1]
          deploymentSteps[deployment] = 'completed'
        }
      }
      
      // Workflow step tracking
      if (line.includes('EXECUTING step ')) {
        const stepMatch = line.match(/EXECUTING step\s+(\S+)/)
        if (stepMatch) {
          const stepName = stepMatch[1]
          workflowSteps[stepName] = 'running'
        }
      } else if (line.includes('COMPLETED Step ')) {
        const stepMatch = line.match(/COMPLETED Step\s+(\S+)/)
        if (stepMatch) {
          const stepName = stepMatch[1]
          workflowSteps[stepName] = 'completed'
        }
      }
      
      // Cleanup/Undeployment tracking
      if (line.includes('UNDEPLOYING ')) {
        const deploymentMatch = line.match(/UNDEPLOYING\s+(\S+)/)
        if (deploymentMatch) {
          const deployment = deploymentMatch[1]
          deploymentSteps[`undeploy_${deployment}`] = 'running'
        }
      } else if (line.includes('COMPLETED undeployment of ')) {
        const deploymentMatch = line.match(/COMPLETED undeployment of\s+(\S+)/)
        if (deploymentMatch) {
          const deployment = deploymentMatch[1]
          deploymentSteps[`undeploy_${deployment}`] = 'completed'
        }
      }
    }
    
    // Create detailed steps list in order: deployments, workflow steps, undeployments
    // Add deployment steps
    Object.keys(deploymentSteps).forEach(dep => {
      if (!dep.startsWith('undeploy_')) {
        detailedStepsList.push({
          name: `Deploy ${dep}`,
          status: deploymentSteps[dep] as any,
          stepId: `deploy_${dep}`
        })
      }
    })
    
    // Add workflow execution steps
    Object.keys(workflowSteps).forEach(step => {
      // Clean up step name - remove leading slash and make it more readable
      const cleanStepName = step.startsWith('/') ? step.substring(1) : step
      detailedStepsList.push({
        name: `Execute ${cleanStepName}`,
        status: workflowSteps[step] as any,
        stepId: step
      })
    })
    
    // Add undeployment steps
    Object.keys(deploymentSteps).forEach(dep => {
      if (dep.startsWith('undeploy_')) {
        const originalDep = dep.replace('undeploy_', '')
        detailedStepsList.push({
          name: `Undeploy ${originalDep}`,
          status: deploymentSteps[dep] as any,
          stepId: dep
        })
      }
    })
    
    setDetailedSteps(detailedStepsList)
    
    // Update main steps based on progress
    const updateSteps = (
      newSteps: WorkflowStep[],
      deploymentSteps: { [key: string]: string },
      workflowSteps: { [key: string]: string },
      buildingPlan: boolean,
      executingWorkflow: boolean,
      workflowCompleted: boolean,
      workflowStatus: string
    ): WorkflowStep[] => {
      // Update main workflow phases
      newSteps[0].status = 'completed' // Started
      
      if (buildingPlan) {
        newSteps[1].status = 'running'
      } else if (executingWorkflow || Object.keys(deploymentSteps).length > 0) {
        newSteps[1].status = 'completed'
        
        // Check if any deployments are still running
        const hasRunningDeployments: boolean = Object.keys(deploymentSteps).some(dep => 
          !dep.startsWith('undeploy_') && deploymentSteps[dep] === 'running'
        )
        
        if (hasRunningDeployments) {
          newSteps[2].status = 'running'
        } else if (Object.keys(workflowSteps).length > 0) {
          newSteps[2].status = 'completed'
          
          // Check if any workflow steps are still running
          const hasRunningSteps: boolean = Object.values(workflowSteps).includes('running')
          
          if (hasRunningSteps) {
            newSteps[3].status = 'running'
          } else if (workflowCompleted) {
            newSteps[3].status = 'completed'
            
            // Check cleanup status
            const hasRunningUndeployments: boolean = Object.keys(deploymentSteps).some(dep => 
              dep.startsWith('undeploy_') && deploymentSteps[dep] === 'running'
            )
            
            if (hasRunningUndeployments) {
              newSteps[4].status = 'running'
            } else {
              newSteps[4].status = 'completed'
            }
          }
        } else if (Object.keys(deploymentSteps).length > 0) {
          newSteps[2].status = 'completed'
          newSteps[3].status = 'pending'
        }
      }
      
      // Handle final workflow status
      if (workflowStatus === 'completed') {
        newSteps.forEach((step: WorkflowStep) => step.status = 'completed')
      } else if (workflowStatus === 'failed') {
        const runningIndex: number = newSteps.findIndex((step: WorkflowStep) => step.status === 'running')
        if (runningIndex !== -1) {
          newSteps[runningIndex].status = 'failed'
        }
      }
      
      return newSteps
    }
    
    setSteps(prevSteps => {
      const newSteps: WorkflowStep[] = [...prevSteps]
      return updateSteps(newSteps, deploymentSteps, workflowSteps, buildingPlan, executingWorkflow, workflowCompleted, workflowStatus)
    })
  }

  const updateBasicStepStatuses = (workflowStatus: string) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps]
      
      switch (workflowStatus) {
        case 'running':
          newSteps[0].status = 'completed'
          newSteps[1].status = 'running'
          break
        case 'completed':
          newSteps.forEach(step => step.status = 'completed')
          break
        case 'failed':
          newSteps[0].status = 'completed'
          newSteps[1].status = 'failed'
          break
      }
      
      return newSteps
    })
  }

  const getStatusColor = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed': return 'text-success'
      case 'running': return 'text-primary'
      case 'failed': return 'text-danger'
      default: return 'text-muted'
    }
  }

  const getStatusIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed': return '✓'
      case 'running': return '⟳'
      case 'failed': return '✗'
      default: return '○'
    }
  }

  const getOverallStatusColor = () => {
    switch (status) {
      case 'completed': return 'alert-success'
      case 'failed': return 'alert-danger'
      case 'running': return 'alert-info'
      default: return 'alert-warning'
    }
  }

  const handleGetOutput = () => {
    // TODO: Implement output retrieval
    alert('Output retrieval not yet implemented')
  }

  const handleGetLog = () => {
    if (logUrl) {
      window.open(logUrl, '_blank')
    } else {
      alert('Log file not available yet')
    }
  }

  return (
    <div className="mt-4">
      <div className={`alert ${getOverallStatusColor()}`} role="alert">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h5 className="alert-heading mb-1">
              Workflow Execution Status
              {status === 'running' && (
                <span className="spinner-border spinner-border-sm ms-2" role="status"></span>
              )}
            </h5>
            <strong>Project:</strong> {projectName} | <strong>Workflow ID:</strong> {workflowId}
          </div>
          <button 
            type="button" 
            className="btn-close" 
            onClick={onClose}
            aria-label="Close"
          ></button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Deployment Status */}
      <div className={`alert ${status !== 'failed' ? 'alert-success' : 'alert-danger'} mb-3`}>
        <h6 className="mb-1">
          {getStatusIcon(status === 'failed' ? 'failed' : 'completed')} Deployment Status
        </h6>
        <p className="mb-0">
          {status === 'failed' 
            ? 'Deployment failed - check logs for details' 
            : 'Project successfully deployed and workflow initiated'}
        </p>
      </div>

      {/* Step Status - All Steps */}
      <div className="card mb-3">
        <div className="card-header">
          <h6 className="mb-0">Main Execution Phases</h6>
        </div>
        <div className="card-body">
          <div className="list-group list-group-flush">
            {steps.map((step, index) => {
              // Get relevant detailed steps for this main phase
              let relevantDetailedSteps: WorkflowStep[] = []
              
              if (index === 2) { // Deploying Environments
                relevantDetailedSteps = detailedSteps.filter(detailStep => 
                  detailStep.stepId?.startsWith('deploy_') && !detailStep.stepId.startsWith('deploy_undeploy_')
                )
              } else if (index === 3) { // Executing Steps
                relevantDetailedSteps = detailedSteps.filter(detailStep => 
                  detailStep.stepId && !detailStep.stepId.startsWith('deploy_') && !detailStep.stepId.startsWith('undeploy_')
                )
              } else if (index === 4) { // Cleanup & Results
                relevantDetailedSteps = detailedSteps.filter(detailStep => 
                  detailStep.stepId?.startsWith('undeploy_')
                )
              }

              return (
                <div key={index}>
                  <div className="list-group-item px-0">
                    <div className="d-flex align-items-center">
                      <span className={`me-3 ${getStatusColor(step.status)}`} style={{ fontSize: '1.2em' }}>
                        {getStatusIcon(step.status)}
                      </span>
                      <span className={`${getStatusColor(step.status)}`}>
                        <strong>{step.name}</strong>
                        {step.status === 'running' && (
                          <span className="spinner-border spinner-border-sm ms-2" role="status"></span>
                        )}
                      </span>
                    </div>
                  </div>
                  
                  {/* Show detailed steps for this phase if available */}
                  {relevantDetailedSteps.length > 0 && relevantDetailedSteps.map((detailStep, detailIndex) => (
                    <div key={`detailed-${index}-${detailIndex}`} className="list-group-item px-0 py-1" style={{ backgroundColor: '#f8f9fa' }}>
                      <div className="d-flex align-items-center">
                        <span className="me-3" style={{ width: '1.2em' }}></span>
                        <span className={`me-2 ${getStatusColor(detailStep.status)}`} style={{ fontSize: '1em' }}>
                          {getStatusIcon(detailStep.status)}
                        </span>
                        <span className={`${getStatusColor(detailStep.status)}`} style={{ fontSize: '0.9em' }}>
                          {detailStep.name}
                          {detailStep.status === 'running' && (
                            <span className="spinner-border spinner-border-sm ms-2" role="status" style={{ width: '0.8rem', height: '0.8rem' }}></span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="d-flex gap-2 mt-3">
        <button 
          className="btn btn-outline-primary"
          onClick={handleGetOutput}
          disabled={status !== 'completed'}
        >
          Get Output
        </button>
        <button 
          className="btn btn-outline-secondary"
          onClick={handleGetLog}
          disabled={!logUrl}
        >
          View Logs
        </button>
      </div>

      {/* Status Summary */}
      <div className="mt-3">
        <small className="text-muted">
          Status updates every 2 seconds. Close this panel to return to project configuration.
        </small>
      </div>
    </div>
  )
}
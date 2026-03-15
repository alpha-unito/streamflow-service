// components/WorkflowStatus.tsx
import { useCallback, useEffect, useRef, useState } from "react"
import {
  getRunningWorkflows,
  getCurrentUser,
  getWorkflowLogContent,
  getWorkflowLogUrl,
  parseLogPath,
  downloadWorkflowOutput,
} from "../services/workflowService"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "running" | "completed" | "failed"
type OverallStatus = "running" | "completed" | "failed" | "unknown"

interface WorkflowStep {
  name: string
  status: StepStatus
  stepId?: string
}

interface WorkflowStatusProps {
  workflowId: string
  projectName: string
  onClose: () => void
}

type StatusMap = Record<string, StepStatus>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000

const INITIAL_PHASES: WorkflowStep[] = [
  { name: "Starting Workflow", status: "running" },
  { name: "Building Execution Plan", status: "pending" },
  { name: "Deploying Environments", status: "pending" },
  { name: "Executing Steps", status: "pending" },
  { name: "Cleanup & Results", status: "pending" },
]

// ---------------------------------------------------------------------------
// Log‑parsing helpers (pure functions – no React state)
// ---------------------------------------------------------------------------

function matchAll(lines: string[], keyword: string, regex: RegExp): string[] {
  const results = new Set<string>()
  for (const line of lines) {
    if (line.includes(keyword)) {
      const m = line.match(regex)
      if (m) results.add(m[1])
    }
  }
  return [...results]
}

interface ParsedLog {
  deploymentStatuses: StatusMap
  workflowStepStatuses: StatusMap
  buildingPlan: boolean
  executingWorkflow: boolean
  workflowCompleted: boolean
}

function parseLog(content: string): ParsedLog {
  const lines = content.split("\n")

  // Discover all entities first so they appear even when still pending
  const deployments = matchAll(lines, "DEPLOYING ", /DEPLOYING\s+(\S+)/)
  const stepNames = matchAll(lines, "EXECUTING step ", /EXECUTING step\s+(\S+)/)

  const deploymentStatuses: StatusMap = {}
  for (const dep of deployments) {
    deploymentStatuses[dep] = "pending"
    deploymentStatuses[`undeploy_${dep}`] = "pending"
  }

  const workflowStepStatuses: StatusMap = {}
  for (const step of stepNames) {
    workflowStepStatuses[step] = "pending"
  }

  let buildingPlan = false
  let executingWorkflow = false
  let workflowCompleted = false

  for (const line of lines) {
    // Execution plan
    if (line.includes("Building workflow execution plan")) buildingPlan = true
    else if (line.includes("COMPLETED building of workflow execution plan")) buildingPlan = false

    if (line.includes("EXECUTING workflow")) executingWorkflow = true
    if (line.includes("COMPLETED workflow execution")) workflowCompleted = true

    // Deployments
    if (line.includes("DEPLOYING ")) {
      const m = line.match(/DEPLOYING\s+(\S+)/)
      if (m && deploymentStatuses[m[1]] !== "completed") deploymentStatuses[m[1]] = "running"
    } else if (line.includes("COMPLETED deployment of ")) {
      const m = line.match(/COMPLETED deployment of\s+(\S+)/)
      if (m) deploymentStatuses[m[1]] = "completed"
    }

    // Workflow steps
    if (line.includes("EXECUTING step ")) {
      const m = line.match(/EXECUTING step\s+(\S+)/)
      if (m) workflowStepStatuses[m[1]] = "running"
    } else if (line.includes("COMPLETED Step ")) {
      const m = line.match(/COMPLETED Step\s+(\S+)/)
      if (m) workflowStepStatuses[m[1]] = "completed"
    }

    // Undeployments
    if (line.includes("UNDEPLOYING ")) {
      const m = line.match(/UNDEPLOYING\s+(\S+)/)
      if (m) deploymentStatuses[`undeploy_${m[1]}`] = "running"
    } else if (line.includes("COMPLETED undeployment of ")) {
      const m = line.match(/COMPLETED undeployment of\s+(\S+)/)
      if (m) deploymentStatuses[`undeploy_${m[1]}`] = "completed"
    }
  }

  return { deploymentStatuses, workflowStepStatuses, buildingPlan, executingWorkflow, workflowCompleted }
}

function buildDetailedSteps(deploymentStatuses: StatusMap, workflowStepStatuses: StatusMap): WorkflowStep[] {
  const detailed: WorkflowStep[] = []

  for (const [dep, status] of Object.entries(deploymentStatuses)) {
    if (!dep.startsWith("undeploy_")) {
      detailed.push({ name: `Deploy ${dep}`, status, stepId: `deploy_${dep}` })
    }
  }

  for (const [step, status] of Object.entries(workflowStepStatuses)) {
    const cleanName = step.startsWith("/") ? step.substring(1) : step
    detailed.push({ name: `Execute ${cleanName}`, status, stepId: step })
  }

  for (const [dep, status] of Object.entries(deploymentStatuses)) {
    if (dep.startsWith("undeploy_")) {
      detailed.push({ name: `Undeploy ${dep.replace("undeploy_", "")}`, status, stepId: dep })
    }
  }

  return detailed
}

function computeMainPhases(parsed: ParsedLog, workflowStatus: OverallStatus): WorkflowStep[] {
  const phases = INITIAL_PHASES.map((p) => ({ ...p }))
  const { deploymentStatuses, workflowStepStatuses, buildingPlan, executingWorkflow, workflowCompleted } = parsed

  phases[0].status = "completed"

  if (buildingPlan) {
    phases[1].status = "running"
  } else if (executingWorkflow || Object.keys(deploymentStatuses).length > 0) {
    phases[1].status = "completed"

    const hasRunningDeployments = Object.entries(deploymentStatuses).some(
      ([key, s]) => !key.startsWith("undeploy_") && s === "running",
    )

    if (hasRunningDeployments) {
      phases[2].status = "running"
    } else if (Object.keys(workflowStepStatuses).length > 0) {
      phases[2].status = "completed"

      const hasRunningSteps = Object.values(workflowStepStatuses).includes("running")
      if (hasRunningSteps) {
        phases[3].status = "running"
      } else if (workflowCompleted) {
        phases[3].status = "completed"

        const hasRunningUndeployments = Object.entries(deploymentStatuses).some(
          ([key, s]) => key.startsWith("undeploy_") && s === "running",
        )
        phases[4].status = hasRunningUndeployments ? "running" : "completed"
      }
    } else {
      phases[2].status = "completed"
    }
  }

  // Terminal states override everything
  if (workflowStatus === "completed") {
    phases.forEach((p) => (p.status = "completed"))
  } else if (workflowStatus === "failed") {
    const idx = phases.findIndex((p) => p.status === "running")
    if (idx !== -1) phases[idx].status = "failed"
  }

  return phases
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function statusColor(s: StepStatus | OverallStatus): string {
  switch (s) {
    case "completed":
      return "text-success"
    case "running":
      return "text-primary"
    case "failed":
      return "text-danger"
    default:
      return "text-muted"
  }
}

function statusIcon(s: StepStatus | OverallStatus): string {
  switch (s) {
    case "completed":
      return "✓"
    case "running":
      return "⟳"
    case "failed":
      return "✗"
    default:
      return "○"
  }
}

function Spinner({ size = "sm" }: { size?: "sm" | "xs" }) {
  const style = size === "xs" ? { width: "0.8rem", height: "0.8rem" } : undefined
  return <span className={`spinner-border spinner-border-sm ms-2`} role="status" style={style} />
}

function DetailedStepRow({ step, parentIndex, detailIndex }: { step: WorkflowStep; parentIndex: number; detailIndex: number }) {
  return (
    <div
      key={`detailed-${parentIndex}-${detailIndex}`}
      className="list-group-item px-0 py-1"
      style={{ backgroundColor: "#f8f9fa" }}
    >
      <div className="d-flex align-items-center">
        <span className="me-3" style={{ width: "1.2em" }} />
        <span className={`me-2 ${statusColor(step.status)}`} style={{ fontSize: "1em" }}>
          {statusIcon(step.status)}
        </span>
        <span className={statusColor(step.status)} style={{ fontSize: "0.9em" }}>
          {step.name}
          {step.status === "running" && <Spinner size="xs" />}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowStatus({ workflowId, projectName, onClose }: WorkflowStatusProps) {
  const [status, setStatus] = useState<OverallStatus>("running")
  const [steps, setSteps] = useState<WorkflowStep[]>(() => INITIAL_PHASES.map((p) => ({ ...p })))
  const [detailedSteps, setDetailedSteps] = useState<WorkflowStep[]>([])
  const [currentLogUrl, setCurrentLogUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Use a ref so the interval callback always sees the latest status without
  // re-creating the effect (which would reset the interval).
  const statusRef = useRef(status)
  statusRef.current = status

  const hasLogRef = useRef(false)

  const poll = useCallback(async () => {
    try {
      const response = await getRunningWorkflows()
      const wfStatus = response.running_workflows[workflowId] as OverallStatus | undefined
      if (!wfStatus) return

      setStatus(wfStatus)

      const logPath = response.workflow_logs[workflowId]
      if (logPath) {
        const username = getCurrentUser()
        const logInfo = parseLogPath(logPath)

        if (username && logInfo) {
          const url = getWorkflowLogUrl(username, projectName, logInfo.filename)
          setCurrentLogUrl(url)

          try {
            const content = await getWorkflowLogContent(username, projectName, logInfo.filename)
            hasLogRef.current = true

            const parsed = parseLog(content)
            setDetailedSteps(buildDetailedSteps(parsed.deploymentStatuses, parsed.workflowStepStatuses))
            setSteps(computeMainPhases(parsed, wfStatus))
          } catch (logErr) {
            console.error("Failed to fetch log content:", logErr)
          }
        }
      }

      // Fallback when no log content is available yet
      if (!hasLogRef.current) {
        setSteps((prev) => {
          const next = prev.map((p) => ({ ...p }))
          if (wfStatus === "running") {
            next[0].status = "completed"
            next[1].status = "running"
          } else if (wfStatus === "completed") {
            next.forEach((p) => (p.status = "completed"))
          } else if (wfStatus === "failed") {
            next[0].status = "completed"
            next[1].status = "failed"
          }
          return next
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch workflow status")
    }
  }, [workflowId, projectName])

  useEffect(() => {
    poll()
    const id = setInterval(() => {
      if (statusRef.current === "completed" || statusRef.current === "failed") {
        clearInterval(id)
        return
      }
      poll()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  // ---- Derived data for rendering detailed sub-steps per phase ----
  const detailedByPhase = (index: number): WorkflowStep[] => {
    switch (index) {
      case 2:
        return detailedSteps.filter(
          (s) => s.stepId?.startsWith("deploy_") && !s.stepId.startsWith("deploy_undeploy_"),
        )
      case 3:
        return detailedSteps.filter(
          (s) => s.stepId && !s.stepId.startsWith("deploy_") && !s.stepId.startsWith("undeploy_"),
        )
      case 4:
        return detailedSteps.filter((s) => s.stepId?.startsWith("undeploy_"))
      default:
        return []
    }
  }

  const overallAlertClass = (() => {
    switch (status) {
      case "completed":
        return "alert-success"
      case "failed":
        return "alert-danger"
      case "running":
        return "alert-info"
      default:
        return "alert-warning"
    }
  })()

  const handleViewLog = () => {
    if (currentLogUrl) window.open(currentLogUrl, "_blank")
    else alert("Log file not available yet")
  }

  const handleGetOutput = async () => {
    const username = getCurrentUser()
    if (!username) {
      setError("No current user selected")
      return
    }

    try {
      console.log(`Attempting to download output for user ${username} and project ${projectName}`)
      await downloadWorkflowOutput(username, projectName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to download output"
      setError(msg)
    }
  }

  return (
    <div className="mt-4">
      {/* Overall status banner */}
      <div className={`alert ${overallAlertClass}`} role="alert">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h5 className="alert-heading mb-1">
              Workflow Execution Status
              {status === "running" && <Spinner />}
            </h5>
            <strong>Project:</strong> {projectName} | <strong>Workflow ID:</strong> {workflowId}
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Deployment Status */}
      <div className={`alert ${status !== "failed" ? "alert-success" : "alert-danger"} mb-3`}>
        <h6 className="mb-1">{statusIcon(status === "failed" ? "failed" : "completed")} Deployment Status</h6>
        <p className="mb-0">
          {status === "failed"
            ? "Deployment failed - check logs for details"
            : "Project successfully deployed and workflow initiated"}
        </p>
      </div>

      {/* Main execution phases */}
      <div className="card mb-3">
        <div className="card-header">
          <h6 className="mb-0">Main Execution Phases</h6>
        </div>
        <div className="card-body">
          <div className="list-group list-group-flush">
            {steps.map((step, index) => {
              const relevant = detailedByPhase(index)
              return (
                <div key={index}>
                  <div className="list-group-item px-0">
                    <div className="d-flex align-items-center">
                      <span className={`me-3 ${statusColor(step.status)}`} style={{ fontSize: "1.2em" }}>
                        {statusIcon(step.status)}
                      </span>
                      <span className={statusColor(step.status)}>
                        <strong>{step.name}</strong>
                        {step.status === "running" && <Spinner />}
                      </span>
                    </div>
                  </div>

                  {relevant.map((detail, di) => (
                    <DetailedStepRow key={detail.stepId} step={detail} parentIndex={index} detailIndex={di} />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-outline-primary" onClick={handleGetOutput} disabled={status !== "completed"}>
          Get Output
        </button>
        <button className="btn btn-outline-secondary" onClick={handleViewLog} disabled={!currentLogUrl}>
          View Logs
        </button>
      </div>

      <div className="mt-3">
        <small className="text-muted">
          Status updates every {POLL_INTERVAL_MS / 1000} seconds. Close this panel to return to project configuration.
        </small>
      </div>
    </div>
  )
}

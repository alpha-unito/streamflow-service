// components/WorkflowDetails.tsx
import { useEffect, useState } from "react"
import type { Workflow } from "../types/workflow"
import type { WorkflowDetails as WorkflowDetailsType } from "../types/workflowDetails"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"


import {
  fetchWorkflowDetails,
  executeWorkflow,
} from "../services/workflowService"

interface WorkflowDetailsProps {
  workflow: Workflow
}

export function WorkflowDetails({ workflow }: WorkflowDetailsProps) {
  const [details, setDetails] = useState<WorkflowDetailsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchWorkflowDetails(workflow.id)
      .then(setDetails)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [workflow.id])

  const handleExecute = async () => {
    try {
      setExecuting(true);
      await executeWorkflow(workflow.id)
      alert("Workflow execution started")
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert("An unknown error occurred")
      }
    } finally {
      setExecuting(false)
    }
  };

  if (loading) return <p>Select a workflow to see details...</p>
  if (error) return <p className="text-danger">{error}</p>
  if (!details) return null

  return (
    <div className="row h-100">
      {/* Left: Image */}
      <div className="col-md-6 d-flex align-items-center justify-content-center">
        <img
          src={details.imageUrl}
          alt={`${workflow.name} steps`}
          className="img-fluid rounded border"
        />
      </div>

      {/* Right: Description */}
      <div className="col-md-6 d-flex flex-column">
        <h3>{workflow.name}</h3>

        <div className="flex-grow-1 overflow-auto flex-grow-1 overflow-auto border rounded p-3 bg-white text-start">
          <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          >
            {details.longDescription ?? ""}
          </ReactMarkdown>
        </div>

        <button
          className="btn btn-success mt-3 align-self-start"
          onClick={handleExecute}
          disabled={executing}
        >
          {executing ? "Executing..." : "Execute workflow"}
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import './App.css'
import type { Workflow } from "./types/workflow";
import { WorkflowList } from './components/WorkflowList.tsx'

function App() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const listTitle = selectedWorkflow ? selectedWorkflow.name : "Available Workflows";
  

  return (
     <div className="container-md min-vh-100 min-vw-100 bg-secondary p-3">
      <div className="container-sm bg-light rounded shadow p-5">
      <h1>{listTitle}</h1>
      
        <WorkflowList onSelectWorkflow={setSelectedWorkflow} 
                      selectedWorkflowId={selectedWorkflow?.id}
        /> 


        {selectedWorkflow && (
          <div>
            <h2>{selectedWorkflow.name}</h2>
            <p>{selectedWorkflow.description}</p>
            {/* Later: fetch details or execute workflow */}
          </div>
        )}
      </div>
    </div>
  )
}

export default App

// App.tsx
import { useState } from 'react'
import './App.css'
import type { Workflow } from "./types/workflow";
import { WorkflowList } from './components/WorkflowList.tsx'
import { WorkflowDetails } from "./components/WorkflowDetails"
import { executeExampleWorkflow } from './services/workflowService.ts';


function App() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null> (null)
  const listTitle = selectedWorkflow ? selectedWorkflow.name : "Available Workflows"
  const handleBackToList = () => {setSelectedWorkflow(null);}
  
  // Example run handler
  const handleExampleRun = async (exampleName: string) => {
    try {
      executeExampleWorkflow(exampleName)
    } catch (error) {
      alert("Error: " + error)
    }
  };

  return (
     <div className="container-md min-vh-100 min-vw-100 bg-secondary p-3">
      <div className="container-sm bg-light rounded shadow p-5">
        
        {/* Header */}
        <div className="d-flex align-items-center mb-4">
          {selectedWorkflow && (
            <button className="btn btn-outline-secondary me-3" onClick={() => handleBackToList()}> Back to list </button>
          )}
          {/* Example Run Button */}
          <button className="btn btn-primary ms-2" onClick={() => handleExampleRun("toy_run")}>Run Example Workflow</button>
        </div>
        <h1>{listTitle}</h1>
        {/* Content */}
        {selectedWorkflow ? (
          <WorkflowDetails workflow={selectedWorkflow} />
        ) : (
          <WorkflowList onSelectWorkflow={setSelectedWorkflow}/>
        )} 
      
      </div>
    </div>
  )
}

export default App

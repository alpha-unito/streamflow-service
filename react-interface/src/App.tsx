// App.tsx
import { useState } from 'react'
import './App.css'
import type { Workflow } from "./types/workflow";
import { WorkflowList } from './components/WorkflowList.tsx'
import { WorkflowDetails } from "./components/WorkflowDetails"
import { WorkflowForm } from './components/WorkflowForm.tsx'
import { executeExampleWorkflow, uploadAndRunWorkflow } from './services/workflowService.ts';


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

  // File upload and run handler
  const handleUploadAndRun = async (files: FileList, projectName: string) => {
    try {
      await uploadAndRunWorkflow(files, projectName);
      alert(`Successfully started workflow for project: ${projectName}`);
    } catch (error) {
      alert("Error uploading workflow: " + error);
      throw error; // Re-throw to allow form to handle the error state
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
        
        {/* Upload Form - only show when not viewing workflow details */}
        {!selectedWorkflow && <WorkflowForm onSubmit={handleUploadAndRun} />}
        
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

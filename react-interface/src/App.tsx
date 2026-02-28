// App.tsx
import { useState } from 'react'
import './App.css'
import type { DefaultProject } from "./services/workflowService";
import { WorkflowList } from './components/WorkflowList.tsx'
import { WorkflowDetails } from "./components/WorkflowDetails"
import { WorkflowForm } from './components/WorkflowForm.tsx'
// import { DefaultProjectDownloader } from './components/DefaultProjectDownloader.tsx'
import { uploadAndRunWorkflow, setCurrentUser } from './services/workflowService.ts';


function App() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<DefaultProject | null> (null)
  const [username, setUsername] = useState<string | null>(null)
  const listTitle = selectedWorkflow ? selectedWorkflow.name : "Available Projects"
  const handleBackToList = () => {setSelectedWorkflow(null);}
  

  // File upload and run handler
  const handleUploadAndRun = async (files: File[], projectName: string) => {
    try {
      const result = await uploadAndRunWorkflow(files, projectName);
      alert(`Successfully started workflow! Workflow ID: ${result.workflow_id}`);
    } catch (error) {
      alert("Error uploading workflow: " + error);
      throw error; // Re-throw to allow form to handle the error state
    }
  };

  const handleUsernameSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const enteredUsername = formData.get("username") as string;
    setUsername(enteredUsername);
    setCurrentUser(enteredUsername);
  };

  if (!username) {
    return (
      <div className="container-md min-vh-100 min-vw-100 bg-secondary p-3 d-flex justify-content-center align-items-center">
        <form onSubmit={handleUsernameSubmit} className="bg-light p-4 rounded shadow">
          <h2 className="mb-3">Enter your username</h2>
          <div className="mb-3">
            <label htmlFor="username" className="form-label">Username</label>
            <input type="text" id="username" name="username" className="form-control" required />
          </div>
          <button type="submit" className="btn btn-primary">Submit</button>
        </form>
      </div>
    );
  }

  return (
     <div className="container-md min-vh-100 min-vw-100 bg-secondary p-3">
      <div className="container-sm bg-light rounded shadow p-5">
        
        {/* Header */}
        <div className="d-flex align-items-center mb-4">
          {selectedWorkflow && (
            <button className="btn btn-outline-secondary me-3" onClick={() => handleBackToList()}> Back to list </button>
          )}
        </div>
        <h1>{listTitle}</h1>
        
        {/* Content */}
        {selectedWorkflow ? (
          <WorkflowDetails workflow={selectedWorkflow} />
        ) : (
          <WorkflowList onSelectWorkflow={setSelectedWorkflow}/>
        )} 

        {/* Upload Form - only show when not viewing workflow details */}
        {!selectedWorkflow && <WorkflowForm onSubmit={handleUploadAndRun} />}
      
      </div>
    </div>
  )
}

export default App

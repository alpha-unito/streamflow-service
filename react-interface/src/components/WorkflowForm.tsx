// components/WorkflowForm.tsx
import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';

interface WorkflowFormProps {
  onSubmit: (files: FileList, projectName: string) => void;
}

export function WorkflowForm({ onSubmit }: WorkflowFormProps) {
  const [projectName, setProjectName] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProjectName(e.target.value);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select at least one file');
      return;
    }
    
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onSubmit(selectedFiles, projectName.trim());
      // Reset form after successful submission
      setProjectName('');
      setSelectedFiles(null);
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Error submitting workflow:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container-md bg-light rounded shadow p-4 mb-4">
      <h3 className="mb-4">Upload Workflow Files</h3>
      
      <form onSubmit={handleSubmit}>
        {/* Project Name Input */}
        <div className="mb-3">
          <label htmlFor="project-name" className="form-label">
            Project Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            id="project-name"
            className="form-control"
            value={projectName}
            onChange={handleProjectNameChange}
            placeholder="Enter project name"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* File Upload Input */}
        <div className="mb-3">
          <label htmlFor="file-input" className="form-label">
            Workflow Files <span className="text-danger">*</span>
          </label>
          <input
            type="file"
            id="file-input"
            className="form-control"
            onChange={handleFileChange}
            multiple
            required
            disabled={isSubmitting}
            accept=".cwl,.yml,.yaml,.json,.py"
          />
          <div className="form-text">
            Select one or more workflow files (.cwl, .yml, .yaml, .json, .py)
          </div>
        </div>

        {/* File List Display */}
        {selectedFiles && selectedFiles.length > 0 && (
          <div className="mb-3">
            <h6>Selected Files:</h6>
            <ul className="list-group list-group-flush">
              {Array.from(selectedFiles).map((file, index) => (
                <li key={index} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>{file.name}</span>
                  <small className="text-muted">{(file.size / 1024).toFixed(1)} KB</small>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit Button */}
        <div className="d-flex gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !projectName.trim() || !selectedFiles || selectedFiles.length === 0}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Running...
              </>
            ) : (
              'Run Workflow'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
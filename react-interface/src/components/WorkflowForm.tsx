// components/WorkflowForm.tsx
import { useState, useRef } from 'react';
import type { FormEvent, ChangeEvent } from 'react';

interface WorkflowFormProps {
  onSubmit: (files: File[], projectName: string) => void;
}

interface FileItem {
  file: File;
  id: string;
  isDirectory?: boolean;
}

export function WorkflowForm({ onSubmit }: WorkflowFormProps) {
  const [projectName, setProjectName] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<FileItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProjectName(e.target.value);
  };

  const handleAddFiles = () => {
    fileInputRef.current?.click();
  };

  const handleAddDirectory = () => {
    directoryInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newItems: FileItem[] = Array.from(files).map(file => ({
        file,
        id: `${Date.now()}-${Math.random()}`,
        isDirectory: false
      }));
      setSelectedItems(prev => [...prev, ...newItems]);
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  const handleDirectoryChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newItems: FileItem[] = Array.from(files).map(file => ({
        file,
        id: `${Date.now()}-${Math.random()}`,
        isDirectory: true
      }));
      setSelectedItems(prev => [...prev, ...newItems]);
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  const removeItem = (id: string) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (selectedItems.length === 0) {
      alert('Please select at least one file or directory');
      return;
    }
    
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const files = selectedItems.map(item => item.file);
      await onSubmit(files, projectName.trim());
      // Reset form after successful submission
      setProjectName('');
      setSelectedItems([]);
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

        {/* File Upload Section */}
        <div className="mb-3">
          <label className="form-label">
            Add Files and Directories <span className="text-danger">*</span>
          </label>
          
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            multiple
            accept=".cwl,.yml,.yaml,.json,.py"
            disabled={isSubmitting}
          />
          
          <input
            ref={directoryInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleDirectoryChange}
            {...({ webkitdirectory: "" } as any)}
            disabled={isSubmitting}
          />
          
          {/* Action buttons */}
          <div className="d-flex gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={handleAddFiles}
              disabled={isSubmitting}
            >
              <i className="bi bi-file-plus me-2"></i>
              Add Files
            </button>
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={handleAddDirectory}
              disabled={isSubmitting}
            >
              <i className="bi bi-folder-plus me-2"></i>
              Add Directory
            </button>
          </div>
          
          <div className="form-text">
            Add workflow files (.cwl, .yml, .yaml, .json, .py) and directories one by one
          </div>
        </div>

        {/* Selected Items Display */}
        {selectedItems.length > 0 && (
          <div className="mb-3">
            <h6>Selected Items ({selectedItems.length}):</h6>
            <div className="list-group">
              {selectedItems.map((item) => (
                <div key={item.id} className="list-group-item d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <i className={`me-2 ${item.isDirectory ? 'bi bi-folder' : 'bi bi-file-earmark'}`}></i>
                    <div>
                      <div>{item.file.name}</div>
                      <small className="text-muted">
                        {item.isDirectory ? 'Directory' : `${(item.file.size / 1024).toFixed(1)} KB`}
                        {item.file.webkitRelativePath && (
                          <span> • {item.file.webkitRelativePath}</span>
                        )}
                      </small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeItem(item.id)}
                    disabled={isSubmitting}
                    title="Remove item"
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="d-flex gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !projectName.trim() || selectedItems.length === 0}
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
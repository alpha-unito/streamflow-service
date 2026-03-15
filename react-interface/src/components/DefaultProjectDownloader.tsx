import React, { useState, useEffect } from 'react';
import { fetchDefaultProjects, downloadDefaultProject, type DefaultProject } from '../services/workflowService';

export const DefaultProjectDownloader: React.FC = () => {
  const [projects, setProjects] = useState<DefaultProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchDefaultProjects();
      setProjects(response.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load default projects');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (projectName: string) => {
    try {
      setDownloading(projectName);
      await downloadDefaultProject(projectName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download project');
    } finally {
      setDownloading(null);
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  if (loading) {
    return (
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center">
            <div className="spinner-border spinner-border-sm me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span>Loading default projects...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Default Project Templates</h5>
        <button 
          className="btn btn-outline-secondary btn-sm"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Hide' : 'Show'} ({projects.length} available)
        </button>
      </div>
      
      {isExpanded && (
        <div className="card-body">
          {error && (
            <div className="alert alert-danger alert-dismissible" role="alert">
              {error}
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setError(null)}
                aria-label="Close"
              ></button>
            </div>
          )}
          
          {projects.length === 0 ? (
            <div className="text-muted text-center py-3">
              No default projects available
            </div>
          ) : (
            <div className="row">
              {projects.map((project) => (
                <div key={project.name} className="col-md-6 col-lg-4 mb-3">
                  <div className="card h-100">
                    <div className="card-body d-flex flex-column">
                      <h6 className="card-title">{project.name}</h6>
                      <p className="card-text text-muted small mb-3">
                        {project.files.length} files included:
                      </p>
                      <div className="mb-3 flex-grow-1">
                        <div className="small text-muted" style={{ maxHeight: '100px', overflowY: 'auto' }}>
                          {project.files.slice(0, 5).map((file, index) => (
                            <div key={index} className="text-truncate">• {file}</div>
                          ))}
                          {project.files.length > 5 && (
                            <div className="text-muted">... and {project.files.length - 5} more</div>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm mt-auto"
                        onClick={() => handleDownload(project.name)}
                        disabled={downloading === project.name}
                      >
                        {downloading === project.name ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-download me-2"></i>
                            Download ZIP
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="text-center mt-3">
            <button 
              className="btn btn-outline-secondary btn-sm"
              onClick={loadProjects}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-1"></i>
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
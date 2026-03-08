from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# import for streamflow run

import os
import threading
import logging
import subprocess
from datetime import datetime
from os.path import expanduser
from typing import Dict, Any
import zipfile
import mimetypes
import tempfile

import yaml
from model import *

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with the specific origin(s) you want to allow
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Global dictionary to track running workflows
running_workflows = {}
workflow_logs = {}
workflow_lock = threading.Lock()

def get_custom_tmpdir():
    """Get custom temporary directory for streamflow"""
    custom_tmpdir = os.path.join(expanduser("~"), "tmp")
    os.makedirs(custom_tmpdir, exist_ok=True)
    return custom_tmpdir

def setup_logging(log_file_path: str):
    """Setup logging to file with immediate flushing"""
    logger = logging.getLogger(f'workflow_{os.getpid()}_{threading.get_ident()}')
    logger.setLevel(logging.INFO)
    
    # Remove any existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create file handler with immediate flushing
    file_handler = logging.FileHandler(log_file_path, mode='a')
    file_handler.setLevel(logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    
    # Enable auto-flush for immediate writes
    try:
        file_handler.stream.reconfigure(line_buffering=True)
    except AttributeError:
        # Fallback for older Python versions
        pass
    
    # Add handler to logger
    logger.addHandler(file_handler)
    
    return logger

def run_workflow_with_subprocess(project_path: str, log_file_path: str, workflow_id: str):
    """Run workflow using subprocess with logging"""
    logger = None
    
    try:
        # Setup logging for this workflow
        logger = setup_logging(log_file_path)
        logger.info(f"Starting workflow {workflow_id}")
        logger.info(f"Project path: {project_path}")
        
        # Create custom temporary directory
        tmpdir = get_custom_tmpdir()
        logger.info(f"Using temporary directory: {tmpdir}")
        
        # Prepare environment for subprocess
        env = os.environ.copy()
        env['TMPDIR'] = tmpdir
        
        # Prepare the streamflow command
        cmd = ['streamflow', 'run', 'streamflow.yml']
        logger.info(f"Running command: {' '.join(cmd)}")
        logger.info(f"Working directory: {project_path}")
        
        # Run the subprocess
        process = subprocess.Popen(
            cmd,
            cwd=project_path,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Merge stderr into stdout for real-time logging
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Read output in real-time line by line
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                # Log each line as it comes
                logger.info(output.rstrip())
                
                # Flush the log file to ensure immediate write
                for handler in logger.handlers:
                    if hasattr(handler, 'flush'):
                        handler.flush()
        
        # Get final return code
        return_code = process.returncode
        
        # Check return code
        if return_code == 0:
            logger.info(f"Workflow {workflow_id} completed successfully")
            with workflow_lock:
                running_workflows[workflow_id] = "completed"
        else:
            logger.error(f"Workflow {workflow_id} failed with return code: {return_code}")
            with workflow_lock:
                running_workflows[workflow_id] = "failed"
        
    except Exception as e:
        if logger is None:
            logger = setup_logging(log_file_path)
        logger.error(f"Workflow {workflow_id} failed: {str(e)}", exc_info=True)
        
        # Update workflow status with thread safety
        with workflow_lock:
            running_workflows[workflow_id] = "failed"
    finally:
        # Clean up handlers
        if logger:
            for handler in logger.handlers[:]:
                handler.close()
                logger.removeHandler(handler)

# ----------------------------------------

@app.get("/workflows", response_model=list[Workflow])
def getWorkFlows():
    # create args and map it with tmp files
    return workflows_list

@app.get("/running_workflows")
def get_running_workflows():
    """Get status of all running workflows"""
    return {
        "running_workflows": running_workflows,
        "workflow_logs": workflow_logs
    }

@app.get("/workflow_logs/{usr}/{project_name}/{log_filename}")
def get_workflow_log_file(usr: str, project_name: str, log_filename: str):
    """Serve log files"""
    log_file_path = f"./usrs_dir/{usr}/{project_name}/logs/{log_filename}"
    if os.path.exists(log_file_path):
        return FileResponse(log_file_path, media_type="text/plain")
    else:
        raise HTTPException(status_code=404, detail="Log file not found")

@app.get("/workflow_logs_content/{usr}/{project_name}/{log_filename}")
def get_workflow_log_content(usr: str, project_name: str, log_filename: str):
    """Get log file content as text for parsing"""
    log_file_path = f"./usrs_dir/{usr}/{project_name}/logs/{log_filename}"
    if os.path.exists(log_file_path):
        try:
            with open(log_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return {"content": content}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading log file: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="Log file not found")

@app.get("/workflows/{workflow_name}", response_model=WorkflowDetails)
def getWorkFlowDetails(workflow_name: str):
    res = Workflow_Details.get(workflow_name)
    if res is None:  #Todo: manage multiple workflows details, taken from real dir
        raise HTTPException(status_code=404, detail="Workflow not found")
    return res

@app.get("/default_projects")
def list_default_projects():
    """List all available default projects"""
    default_projects_dir = "./default_projects"
    
    if not os.path.exists(default_projects_dir):
        return {"projects": [], "message": "No default projects directory found"}
    
    projects = []
    try:
        for item in os.listdir(default_projects_dir):
            item_path = os.path.join(default_projects_dir, item)
            if os.path.isdir(item_path):
                # Get list of files in the project
                files = []
                for root, dirs, filenames in os.walk(item_path):
                    for filename in filenames:
                        rel_path = os.path.relpath(os.path.join(root, filename), item_path)
                        files.append(rel_path.replace(os.sep, '/'))
                
                projects.append({
                    "name": item,
                    "files": files
                })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading default projects: {str(e)}")
    
    return {"projects": projects}

@app.get("/default_projects/{project_name}/files/{file_path:path}")
def get_default_project_file(project_name: str, file_path: str):
    """Download a specific file from a default project"""
    # Sanitize the project name and file path to prevent directory traversal
    project_name = os.path.basename(project_name)
    file_path = file_path.lstrip('/')
    
    # Construct the full file path
    full_path = os.path.join("./default_projects", project_name, file_path)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_file_path = os.path.abspath(full_path)
    
    if not abs_file_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(full_path)
    if mime_type is None:
        mime_type = "application/octet-stream"
    
    return FileResponse(
        path=full_path,
        media_type=mime_type,
        filename=os.path.basename(file_path)
    )

@app.get("/default_projects/{project_name}/image")
def get_default_project_image(project_name: str):
    """Get workflow diagram image for a default project"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_project_path = os.path.abspath(project_path)
    
    if not abs_project_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Look for common image file extensions
    image_extensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif']
    image_files = []
    
    for root, dirs, files in os.walk(project_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in image_extensions):
                # Prioritize files with 'workflow', 'diagram', or 'flow' in the name
                if any(keyword in file.lower() for keyword in ['workflow', 'diagram', 'graph', 'flow', 'pipeline']):
                    image_files.insert(0, os.path.join(root, file))
                else:
                    image_files.append(os.path.join(root, file))
    
    if not image_files:
        raise HTTPException(status_code=404, detail="No workflow image found")
    
    # Return the first (prioritized) image
    image_path = image_files[0]
    
    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(image_path)
    if mime_type is None:
        mime_type = "application/octet-stream"
    
    return FileResponse(
        path=image_path,
        media_type=mime_type,
        filename=os.path.basename(image_path)
    )

@app.get("/default_projects/{project_name}/description")
def get_default_project_description(project_name: str):
    """Get workflow description (README) for a default project"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_project_path = os.path.abspath(project_path)
    
    if not abs_project_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Look for README files
    readme_files = []
    readme_names = ['readme.md', 'readme.txt', 'readme', 'description.md']
    
    for root, dirs, files in os.walk(project_path):
        for file in files:
            if file.lower() in readme_names:
                readme_files.append(os.path.join(root, file))
    
    if not readme_files:
        # Return a default description if no README found
        return {
            "content": f"# {project_name}\n\nNo description available for this workflow.",
            "filename": "generated"
        }
    
    # Use the first README file found
    readme_path = readme_files[0]
    
    try:
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "content": content,
            "filename": os.path.basename(readme_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading description file: {str(e)}")

@app.get("/default_projects/{project_name}/streamflow")
def get_default_project_streamflow_as_json(project_name: str):
    """Get all project files with streamflow.yml converted to JSON"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_project_path = os.path.abspath(project_path)
    
    if not abs_project_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        project_files = {}
        streamflow_config = None
        
        # Walk through all files in the project directory
        for root, dirs, files in os.walk(project_path):
            for filename in files:
                file_path = os.path.join(root, filename)
                relative_path = os.path.relpath(file_path, project_path)
                # Normalize path separators for consistency
                relative_path = relative_path.replace(os.sep, '/')
                
                try:
                    # Handle YAML files
                    if filename.endswith(('.yml', '.yaml')):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = yaml.safe_load(f)
                            project_files[relative_path] = {
                                'type': 'yaml',
                                'content': content
                            }
                            
                            # Special handling for streamflow.yml
                            if filename == 'streamflow.yml':
                                streamflow_config = content
                    
                    # Handle cwl files (CWL)
                    elif filename.endswith(('.cwl')):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            project_files[relative_path] = {
                                'type': 'cwl',
                                'content': content
                            }

                    # Handle script files (.py and sh)
                    elif filename.endswith(('.py', '.sh')):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            project_files[relative_path] = {
                                'type': 'script',
                                'content': content
                            }
                    
                    # Handle text-based files (txt and md)
                    elif filename.endswith(('.txt', '.md')):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            project_files[relative_path] = {
                                'type': 'text',
                                'content': content
                            }
                    
                    # Handle other files as binary/text based on content
                    else:
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                project_files[relative_path] = {
                                    'type': 'text',
                                    'content': content
                                }
                        except UnicodeDecodeError:
                            # Binary file - skip or handle differently
                            project_files[relative_path] = {
                                'type': 'binary',
                                'content': 'Binary file - not editable'
                            }
                
                except Exception as e:
                    # If we can't read a file, note the error
                    project_files[relative_path] = {
                        'type': 'error',
                        'content': f'Error reading file: {str(e)}'
                    }
        
        return {
            "project_name": project_name,
            "streamflow_config": streamflow_config,
            "project_files": project_files
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading project files: {str(e)}")

@app.get("/default_projects/{project_name}/image")
def get_default_project_image(project_name: str):
    """Get workflow diagram image for a default project"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_project_path = os.path.abspath(project_path)
    
    if not abs_project_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Look for common image file extensions
    image_extensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif']
    image_files = []
    
    for root, dirs, files in os.walk(project_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in image_extensions):
                # Prioritize files with 'workflow', 'diagram', or 'flow' in the name
                if any(keyword in file.lower() for keyword in ['workflow', 'diagram', 'flow', 'pipeline']):
                    image_files.insert(0, os.path.join(root, file))
                else:
                    image_files.append(os.path.join(root, file))
    
    if not image_files:
        raise HTTPException(status_code=404, detail="No workflow image found")
    
    # Return the first (prioritized) image
    image_path = image_files[0]
    
    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(image_path)
    if mime_type is None:
        mime_type = "application/octet-stream"
    
    return FileResponse(
        path=image_path,
        media_type=mime_type,
        filename=os.path.basename(image_path)
    )

@app.get("/default_projects/{project_name}/description")
def get_default_project_description(project_name: str):
    """Get workflow description (README) for a default project"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    # Security check: ensure the path is within the default_projects directory
    abs_projects_dir = os.path.abspath("./default_projects")
    abs_project_path = os.path.abspath(project_path)
    
    if not abs_project_path.startswith(abs_projects_dir):
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Look for README files
    readme_files = []
    readme_names = ['readme.md', 'readme.txt', 'readme', 'description.md']
    
    for root, dirs, files in os.walk(project_path):
        for file in files:
            if file.lower() in readme_names:
                readme_files.append(os.path.join(root, file))
    
    if not readme_files:
        # Return a default description if no README found
        return {
            "content": f"# {project_name}\n\nNo description available for this workflow.",
            "filename": "generated"
        }
    
    # Use the first README file found
    readme_path = readme_files[0]
    
    try:
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "content": content,
            "filename": os.path.basename(readme_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading description file: {str(e)}")

@app.get("/default_projects/{project_name}/download")
def download_default_project_archive(project_name: str):
    """Download entire default project as a ZIP archive"""
    # Sanitize the project name
    project_name = os.path.basename(project_name)
    project_path = os.path.join("./default_projects", project_name)
    
    if not os.path.exists(project_path) or not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Create a temporary ZIP file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    temp_zip.close()
    
    try:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(project_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arc_name = os.path.relpath(file_path, project_path)
                    zipf.write(file_path, arc_name)
        
        return FileResponse(
            path=temp_zip.name,
            media_type="application/zip",
            filename=f"{project_name}.zip",
            background=lambda: os.unlink(temp_zip.name)  # Clean up temp file after sending
        )
    except Exception as e:
        os.unlink(temp_zip.name)  # Clean up on error
        raise HTTPException(status_code=500, detail=f"Error creating archive: {str(e)}")

# ----------------------------------------

# streamflow run with args post 
@app.post("/run/{usr}/{project_name}")
def run(usr: str, project_name: str | None, files: list[UploadFile]) -> dict:
    
    if files.__len__() < 1:
        raise HTTPException(status_code=400, detail="At least one file is required")
    
    #TODO: validate files
        
    # save tmp dir // creates temporary directory
    proj_path = getDefaultProjectDir(usr, project_name)

    # put files into tmp directory with proper directory structure
    for elem in files:
        raw = elem.file.read()
        filename = elem.filename
        
        # Handle directory structure - check if filename contains path separators
        if filename and ('/' in filename or '\\' in filename):
            # Normalize path separators
            normalized_path = filename.replace('\\', '/')
            file_path = os.path.join(proj_path, normalized_path)
            
            # Create directory structure if it doesn't exist
            dir_path = os.path.dirname(file_path)
            os.makedirs(dir_path, exist_ok=True)
            print(f"Created directory structure: {dir_path}")
        else:
            # Single file, save directly in project root
            file_path = os.path.join(proj_path, str(filename))
        
        # Write file to its destination
        with open(file_path, "wb") as f:
            f.write(raw)
        print(f"saved file: {file_path}")
          

    # Create output directory
    output_dir = proj_path + "/output"
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate unique workflow ID
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    project_safe_name = project_name if project_name else "unknown"
    workflow_id = f"{project_safe_name}_{usr}_{timestamp}"
    
    # Create log file path
    log_dir = f"./usrs_dir/{usr}/{project_name}/logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = f"{log_dir}/{workflow_id}.log"
    
    # Mark workflow as running with thread safety
    with workflow_lock:
        running_workflows[workflow_id] = "running"
        workflow_logs[workflow_id] = log_file_path
    
    # Start workflow in separate thread using subprocess
    thread = threading.Thread(
        target=run_workflow_with_subprocess,
        args=(proj_path, log_file_path, workflow_id)
    )
    thread.daemon = True
    thread.start()
    
    return {
        "workflow_id": workflow_id,
        "status": "started",
        "log_file": log_file_path
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4646)

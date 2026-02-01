from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# import for streamflow run

import asyncio
import os
import threading
import logging
import sys
import tempfile
from datetime import datetime
from argparse import Namespace
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
from os.path import expanduser
import uuid
from typing import Dict, Any


from streamflow.config.config import WorkflowConfig
from streamflow.config.validator import SfValidator
from streamflow.cwl.main import main as cwl_main
from streamflow.ext.utils import load_extensions
from streamflow.log_handler import logger as sf_logger
from streamflow.main import build_context, _async_run

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

def get_custom_tmpdir(workflow_id: str):
    """Get custom temporary directory for specific workflow"""
    custom_tmpdir = os.path.join(expanduser("~"), "tmp", "streamflow", workflow_id)
    os.makedirs(custom_tmpdir, exist_ok=True)
    return custom_tmpdir

def setup_logging(log_file_path: str):
    """Setup logging to file"""
    logger = logging.getLogger(f'workflow_{os.getpid()}_{threading.get_ident()}')
    logger.setLevel(logging.INFO)
    
    # Remove any existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create file handler
    file_handler = logging.FileHandler(log_file_path)
    file_handler.setLevel(logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(file_handler)
    
    return logger

def run_workflow_with_logging(args_dict: dict, log_file_path: str, workflow_id: str):
    """Run workflow in separate thread with logging and isolated environment"""
    logger = None
    original_env = {}
    
    try:
        # Setup logging for this workflow
        logger = setup_logging(log_file_path)
        logger.info(f"Starting workflow {workflow_id}")
        logger.info(f"Arguments: {args_dict}")
        
        # Create isolated temporary directory for this workflow
        workflow_tmpdir = get_custom_tmpdir(workflow_id)
        logger.info(f"Using workflow-specific temporary directory: {workflow_tmpdir}")
        
        # Save original environment variables
        original_env = {
            'TMPDIR': os.environ.get('TMPDIR'),
            'TMP': os.environ.get('TMP'),
            'TEMP': os.environ.get('TEMP')
        }
        
        # Set isolated environment variables for this workflow thread
        os.environ['TMPDIR'] = workflow_tmpdir
        os.environ['TMP'] = workflow_tmpdir
        os.environ['TEMP'] = workflow_tmpdir
        
        # Use thread-local temporary directory
        old_tempdir = tempfile.tempdir
        tempfile.tempdir = workflow_tmpdir
        
        # Capture stdout and stderr
        stdout_capture = StringIO()
        stderr_capture = StringIO()
        
        # Run the workflow using asyncio properly for thread execution
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_async_run(Namespace(**args_dict)))
            finally:
                loop.close()
        
        # Log captured output
        stdout_content = stdout_capture.getvalue()
        stderr_content = stderr_capture.getvalue()
        
        if stdout_content:
            logger.info(f"STDOUT:\n{stdout_content}")
        if stderr_content:
            logger.error(f"STDERR:\n{stderr_content}")
        
        logger.info(f"Workflow {workflow_id} completed successfully")
        
        # Update workflow status with thread safety
        with workflow_lock:
            running_workflows[workflow_id] = "completed"
        
    except Exception as e:
        if logger is None:
            logger = setup_logging(log_file_path)
        logger.error(f"Workflow {workflow_id} failed: {str(e)}", exc_info=True)
        
        # Update workflow status with thread safety
        with workflow_lock:
            running_workflows[workflow_id] = "failed"
    finally:
        # Restore original environment variables
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        
        # Restore original tempdir
        tempfile.tempdir = old_tempdir if 'old_tempdir' in locals() else None
        
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

@app.get("/workflow_logs/{usr}/{log_filename}")
def get_workflow_log_file(usr: str, log_filename: str):
    """Serve log files"""
    log_file_path = f"./usrs_dir/{usr}/logs/{log_filename}"
    if os.path.exists(log_file_path):
        return FileResponse(log_file_path, media_type="text/plain")
    else:
        raise HTTPException(status_code=404, detail="Log file not found")

@app.get("/workflows/{workflow_name}", response_model=WorkflowDetails)
def getWorkFlowDetails(workflow_name: str):
    res = Workflow_Details.get(workflow_name)
    if res is None:  #Todo: manage multiple workflows details, taken from real dir
        raise HTTPException(status_code=404, detail="Workflow not found")
    return res

# ----------------------------------------

def checkFileValidity(file_n : str | None) :
    return file_n is None or not (file_n.endswith(".yml") or file_n.endswith(".yaml") or file_n.endswith(".cwl"))
     # TODO: check if necessary or how to do it proprerly

# streamflow run with args post 
@app.post("/run/{usr}/{project_name}")
def run(usr: str, project_name: str | None, files: list[UploadFile]) -> dict:
    
    if files.__len__() < 1:
        raise HTTPException(status_code=400, detail="At least one file is required")
    
    # Validate files
    for elem in files:
        if checkFileValidity(elem.filename):
            raise HTTPException(status_code=400, detail=f"{elem.filename} must be a .yml, .yaml or .cwl")
        
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
          

    # create args and map it with tmp files
    args: dict[str, str] = {}
    args["name"] = ""
    args["outdir"] = proj_path + "/output"
    args["streamflow_file"] = proj_path + "/streamflow.yml"
    
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
    
    # Start workflow in separate thread
    thread = threading.Thread(
        target=run_workflow_with_logging,
        args=(args, log_file_path, workflow_id)
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

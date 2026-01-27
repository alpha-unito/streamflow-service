from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# import for streamflow run

import asyncio
import os
from argparse import Namespace


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
# ----------------------------------------

@app.get("/workflows", response_model=list[Workflow])
def getWorkFlows():
    # create args and map it with tmp files
    return workflows_list

@app.get("/workflows/{workflow_name}", response_model=WorkflowDetails)
def getWorkFlowDetails(workflow_name: str):
    res = Workflow_Details.get(workflow_name)
    if res is None:  #Todo: manage multiple workflows details, taken from real dir
        raise HTTPException(status_code=404, detail="Workflow not found")
    return res

#Toy streamflow run
@app.get("/example_run/{example_name}/{usr}")
def example_run(example_name: str, usr: str)  -> None:
    # create args and map it with tmp files
    args:dict[str,str] = {}
    args["name"] = ""
    args["outdir"] = f"./usrs_dir/{usr}/{example_name}/output"
    args["streamflow_file"] = examples_runs[example_name]+"/streamflow.yml"
    asyncio.run(_async_run(Namespace(**args)))

# ----------------------------------------

def checkFileValidity(file_n : str | None) :
    return file_n is None or not (file_n.endswith(".yml") or file_n.endswith(".yaml") or file_n.endswith(".cwl"))
     # TODO: check if necessary or how to do it proprerly

# streamflow run with args post 
@app.post("/run/{usr}/{project_name}")
def run(usr: str, project_name: str | None, files: list[UploadFile])  -> None:
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
    args:dict[str,str] = {}
    args["name"] = ""
    args["outdir"] = proj_path + "/output"
    args["streamflow_file"] = proj_path + "/streamflow.yml"
    asyncio.run(_async_run(Namespace(**args)))
    # TODO: send log to client

# json input for post("/run"). `args` in the json is the Namespace needed by _async_run() to work 
''' 
{"usr":"Guest-0"}
'''
    
#streamflow run with args post 
@app.post("/workflows/{workflow_name}/execute") #TODO: use usr output directories and use @app.post("{workflow_name}/execute/{usr}") 
def execute(workflow_name: str, files: list[UploadFile])  -> None: #def execute(workflow_name: str,usr: str, files: list[UploadFile])  -> None:
    
    usr = "Guest-0" #TODO: remove this line when usr will be used in path

    if examples_runs.get(workflow_name) is not None:
      proj_path = getDefaultProjectDir(usr, workflow_name) #TODO: verify if usr exists


      # create args and map it with tmp files
      args:dict[str,str] = {}
      args["name"] = ""
      args["outdir"] = proj_path + "/output"
      args["streamflow_file"] = examples_runs.get(workflow_name, "")
      return asyncio.run(_async_run(Namespace(**args)))
    else:
      raise HTTPException(status_code=404, detail="Workflow not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4646)

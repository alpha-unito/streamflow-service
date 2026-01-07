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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


#Toy streamflow run
@app.get("/example_run/{example_name}")
def example_run(example_name: str):
    # create args and map it with tmp files
    args:dict[str,str] = {}
    args["name"] = ""
    args["outdir"] = f"/tmp/streamflow-service/{example_name}/output"
    args["streamflow_file"] = examples_runs[example_name]+"/streamflow.yml"
    asyncio.run(_async_run(Namespace(**args)))

#Toy streamflow run
@app.get("/workflows", response_model=list[Workflow])
def getWorkFlows():
    # create args and map it with tmp files
    return workflows_info

#streamflow run with args post 
@app.post("/run/{usr}")
def run(usr: str, files: list[UploadFile])  -> None:
    if files.__len__() < 3:
        raise HTTPException(status_code=400, detail="files must be at least 3") #TODO: verify if files can be more than 3
    for elem in files:
        if checkFileValidity(elem.filename):
            raise HTTPException(status_code=400, detail=f"{elem.file.name} must be a .yml, .yaml or .cwl")
        
    # save tmp dir // creates temporary directory
    proj_path = addDefaultProjectDir(usr) #TODO: verify if usr exists
    checkOrCreateDir(proj_path)

    # put files into tmp directory
    for elem in files:
        raw = elem.file.read()
        filename = elem.filename
        with open(proj_path+"/"+str(filename), "xb") as f:
            f.write(raw)
            f.close()

    # create args and map it with tmp files
    args:dict[str,str] = {}
    args["name"] = ""
    args["outdir"] = proj_path + "/output"
    args["streamflow_file"] = proj_path + "/streamflow.yml"
    asyncio.run(_async_run(Namespace(**args)))
    # TODO: return log in a file (?)

# json input for post("/run"). `args` in the json is the Namespace needed by _async_run() to work 
''' 
{"usr":"Guest-0"}
'''
# ----------------------------------------
#UPLOAD FILES ROUTES

def checkFileValidity(file_n : str | None) :
    return file_n is None or not (file_n.endswith(".yml") or file_n.endswith(".yaml") or file_n.endswith(".cwl"))
    
@app.post("/upload_streamflow")
async def upload_streamflow(file: UploadFile = File(...)):
    filename = file.filename or ''
    # Validate extension
    if checkFileValidity(filename):
        raise HTTPException(status_code=400, detail="File must be a .yml, .yaml or .cwl")

    # Read file content
    content = await file.read()

    try:
        parsed_yaml = yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    return {
        "filename": file.filename,
        "parsed_yaml": parsed_yaml
    }

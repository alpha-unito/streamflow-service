from fastapi import FastAPI, HTTPException, UploadFile, File

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


#Toy args
toy_args = Namespace(
    name = None,
    streamflow_file=str(os.path.join("./toy_files", "streamflow.yml")),
    outdir="./toy_files/toy_run_out",
    # add any other required CLI parameters
)



#Toy streamflow run
@app.get("/toy_run")
def toy_run():
    asyncio.run(_async_run(toy_args))




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
    
@app.post("/upload-streamflow")
async def upload_yml(file: UploadFile = File(...)):
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

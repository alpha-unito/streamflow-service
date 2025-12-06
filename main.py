from fastapi import FastAPI, HTTPException

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
args = Namespace(
    name = None,
    streamflow_file=str(os.path.join("./toy_files", "streamflow.yml")),
    outdir="./toy_files/toy_run_out",
    # add any other required CLI parameters
)



#Toy streamflow run
@app.get("/toy_run")
def toy_run():
    asyncio.run(_async_run(args))




#streamflow run with args post 
@app.post("/run")
def run(request: InputItem)  -> None:
    checkDir(defaultProjectDir(request))
    request.args["outdir"] = defaultProjectDir(request) + "/output"
    #request.args["streamflow_file"] = defaultProjectDir(request) + "/streamflow.yml"
    asyncio.run(_async_run(Namespace(**request.args)))

# json input for post("/run"). `args` in the json is the Namespace needed by _async_run() to work 
''' 
{
  "usr": "guest-0",
  "args": {
    "name": null,
    "streamflow_file": "./toy_files/streamflow.yml"
  }
}
'''
    

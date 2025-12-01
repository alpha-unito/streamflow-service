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


app = FastAPI()

#Toy args
args = Namespace(
    name = None,
    streamflow_file=str(os.path.join("./toy_files", "streamflow.yml")),
    outdir="./toy_files",
    # add any other required CLI parameters
)

#Toy streamflow run
@app.get("/toy_run")
def toy_run() -> None:
    ret = asyncio.run(_async_run(args))


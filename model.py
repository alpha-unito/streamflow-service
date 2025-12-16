from typing import Optional
from pydantic import BaseModel
from argparse import Namespace
import os

# preserved data: a dict with username:ListOfOutputDirectories. Until the outputs will be into tmp, 
#   it is not necessary to maintain coerency between this dict and the actual files
outputs_by_users: dict[str, list[str]] = {} #TODO: as a "library online tool, this seems useless"

examples_runs: dict[str, str] = {
    "toy_run" :     "./SFExamples/toy_files",
    "motor_bike" :  "./SFExamples/workflow-openfoam-new-version/src/openfoam-cwl"
}

#counts projects inside "/tmp/$usr/" and produces a progressive pathname
def addDefaultProjectDir(usr: str) ->str:
    position = os.path.join("/tmp/" + usr)
    number_files = 0
    try :
        number_files = len(os.listdir(position))
    except Exception as e :
        print(f"exception occurred: {e}")
    finally :
        dirName: str = os.path.join(position, "run_"+ str(number_files))

    if usr in outputsByUsers :
        outputsByUsers[usr].append(dirName)
    else :
        outputsByUsers[usr]  = [dirName]
    return dirName


# Creates a directory and return if it exists
def checkOrCreateDir(path) :
    try:
        os.makedirs(path, exist_ok=True)
        print(f"Directory '{path}' created successfully.")
        return True
    except PermissionError:
        print(f"Permission denied: Unable to create '{path}'.")
        return False
    except Exception as e:
        print(f"An error occurred: {e}")
        return False


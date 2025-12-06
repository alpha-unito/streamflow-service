from typing import Optional
from pydantic import BaseModel
from argparse import Namespace
import os

class InputItem(BaseModel):
    usr: str
    args: dict

# preserved data: a dict with username:ListOfOutputDirectories. Until the outputs will be into tmp, 
#   it is not necessary to maintain coerency between this dict and the actual files
outputsByUsers: dict[str, list[str]] = {}

#counts projects inside "/tmp/$usr/" and produces a progressive pathname
def defaultProjectDir(req: InputItem) ->str:
    position = os.path.join("/tmp/" + req.usr)
    number_files = 0
    try :
        number_files = len(os.listdir(position))
    except Exception as e :
        print(f"exception occurred: {e}")
    finally :
        dirName: str = os.path.join(position, "run_"+ str(number_files))

    if req.usr in outputsByUsers :
        outputsByUsers[req.usr].append(dirName)
    else :
        outputsByUsers[req.usr]  = [dirName]
    return dirName


def checkDir(path) :
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

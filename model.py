from typing import Optional
from pydantic import BaseModel
from argparse import Namespace

class InputItem(BaseModel):
    args: dict
    
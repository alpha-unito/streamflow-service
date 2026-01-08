from typing import Optional
from pydantic import BaseModel
from argparse import Namespace
import os

# preserved data: a dict with username:ListOfOutputDirectories. Until the outputs will be into tmp, 
#   it is not necessary to maintain coerency between this dict and the actual files
outputs_by_users: dict[str, list[str]] = {} #TODO: as a "library online tool, this seems useless"


class Workflow(BaseModel):
  id: str
  name: str
  description: Optional[str] = None
  version: Optional[str] = None

class WorkflowDetails(BaseModel):
  id: str
  longDescription: str 
  imageUrl: str

examples_runs: dict[str, str] = {
    "toy_run" :     "./SFExamples/toy_files",
    "motor_bike" :  "./SFExamples/workflow-openfoam-new-version/src/openfoam-cwl"
}

workflows_list: list[Workflow] = [ #TODO: search into a real dir the workflows 
  Workflow(
    id="wf-000",
    name="Toy Run",
    description="A simple example workflow demonstrating basic functionality.",
    version="1.0.0"
  ),
  Workflow(
    id="wf-001",
    name="Motor Bike Simulation",
    description="A complex workflow for simulating motor bike aerodynamics using OpenFOAM.",
    version="2.1.0"
  ),
  Workflow(
    id="wf-002",
    name="Data Ingestion Pipeline",
    description="Ingests raw data from external sources.",
    version="1.0.0"
  ),
  Workflow(
    id="wf-003",
    name="Data Cleaning Workflow",
    description="Cleans and validates datasets.",
    version="1.2.3"
  ),
  Workflow(
    id="wf-004",
    name="Model Training",
    description="Trains ML models.",
    version="2.0.0"
  )
]

Workflow_Details: WorkflowDetails = WorkflowDetails( #TODO: move longDescription into a markdown file
  id="wf-001",
  longDescription='''Descrizione del workflow:
  Il workflow considera la simulazione Motorbike di OpenFOAM, un esempio ampiamente utilizzato per la risoluzione delle equazioni di Navier–Stokes incomprimibili, sia su macchine personali sia su sistemi di calcolo ad alte prestazioni. Il modello descrive un flusso d’aria stazionario attorno a una motocicletta e al pilota.

La configurazione della simulazione determina automaticamente il numero di sottodomini da utilizzare in parallelo in base ai core CPU disponibili. La mesh viene quindi partizionata tramite decomposePar per l’esecuzione parallela. Le equazioni RANS stazionarie e incomprimibili vengono risolte mediante il solver simpleFoam e, al termine della simulazione, i risultati vengono ricombinati in un unico dominio tramite reconstructPar.

Descrizione degli step CWL:
Il workflow generato è definito nel file motorbike-pipeline.cwl ed è suddiviso in tre passaggi principali:
-prep: fase di preparazione della mesh, che esegue il workflow prep-mesh.cwl. In questa fase vengono svolte le operazioni di inizializzazione dell’ambiente, copia della mesh superficiale della moto, generazione delle feature edges e creazione della mesh di base tramite blockMesh.
-decompose: fase di decomposizione e raffinamento della mesh, che esegue decompose-snappy.cwl. In questo step la mesh viene decomposta per l’elaborazione parallela e successivamente raffinata tramite snappyHexMesh.
-foam_run: fase di simulazione vera e propria, che esegue foam-run.cwl. Include la generazione del riepilogo delle patch della mesh, l’esecuzione del solver potentialFoam per la soluzione iniziale, il solver principale simpleFoam per la risoluzione delle equazioni di Navier–Stokes incomprimibili e la ricostruzione finale della mesh mediante reconstructParMesh.''',
  imageUrl="https://drive.google.com/file/d/1R8NPg6H_NJ1xPeGOZI11Cr1wdqd8lZsd/view?usp=sharing"
)

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

  if usr in outputs_by_users :
    outputs_by_users[usr].append(dirName)
  else :
    outputs_by_users[usr]  = [dirName]
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


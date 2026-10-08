# Streamfow-service - Web platform

This repository contains is an implementation of a web platform for deployment of workflows using [StreamFlow](https://streamflow.di.unito.it/). 

The platform relies on fastAPI as backend server and React node.js as frontend server, deployed trougth Docker.


## Usage

Servers, by default, uses *4646 port for fastAPI* server and *4545 port for the Node.js server*.

Once started, the platform let you to upload and run workflows and then retrieve output and log files.

### setup and run fastAPI

To set up the fastAPI server you need to have python3 installed. Then run these commands to create the virtual environment and the required packages:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Note: streamflow requires Python 3.8 to 3.12 to run properly.

To make running fastAPI server just use the command

```bash
python3 main.py
```

### setup and run React interface server

The Node.js server has already a docker file inside the directory `streamflow-service/react-interface`. You need just to move inside the directory than build and run the container:

```bash
cd react-interface
docker build -t react-interface .
docker run -p 4545:8080 --rm react-interface
```

## run workflows: structure of projects

The project is ment to have data and scripts already stored inside the `./SFExamples/` directory, and all the PATH references inside *config*, *main* and *streamflow* files must be configured according to this position.

Using the interface, you can upload any structure of directory or projects, but the streamflow file name *must be* "streamflow.yml", and his position must be in the root of the project. No other file has restriction about name or position

### default projects dir

### routes

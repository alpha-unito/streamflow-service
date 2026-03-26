# Streamfow-service - Web platform

This repository contains is an implementation of a web platform for deployment of workflows using [streamflow](https://streamflow.di.unito.it/). 

The platform relies on fastAPI as backend server and React node.js as frontend server, deployed trougth Docker.


## Usage

Servers, by default, uses *4646 port for fastAPI* server and *4545 port for the Node.js server*.

Once started, the platform let you to upload and run workflows and then retrieve output and log files.

### setup and run the backend

The backend server has already a docker file inside the directory `streamflow-service/backend`. You need just to move inside the directory than build and run the container:

```bash
cd backend
docker build -t streamflow-service-backend .
docker run -p 4646:8080 -v <PATH-TO-DEFAULT-PROJECTS>:/default_projects --rm --detach streamflow-service-backend
```

- replace `<PATH-TO-DEFAULT-PROJECTS>` with the actual path to your default projects directory.

### setup and run the frontend

The frontend server has already a docker file inside the directory `streamflow-service/frontend`. You need just to move inside the directory than build and run the container:

```bash
cd frontend
docker build -t streamflow-service-frontend .
docker run -p 4545:8080 --rm --detach streamflow-service-frontend
```

## run workflows: structure of projects

The project is ment to have data and scripts already stored inside the `./SFExamples/` directory, and all the PATH references inside *config*, *main* and *streamflow* files must be configured according to this position.

Using the interface, you can upload any structure of directory or projects, but the streamflow file name *must be* "streamflow.yml", and his position must be in the root of the project. No other file has restriction about name or position

### default projects dir

### routes
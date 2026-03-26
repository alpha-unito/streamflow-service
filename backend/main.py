from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

import asyncio
import logging
import mimetypes
import os
import tempfile
import zipfile
from datetime import datetime
from os.path import expanduser

import yaml
from model import *

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)

# Global dictionary to track running workflows
# No lock needed: asyncio is single-threaded, dicts are only mutated at non-await points.
running_workflows: dict[str, str] = {}
workflow_logs: dict[str, str] = {}

DEFAULT_PROJECTS_DIR = "/default_projects"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_custom_tmpdir() -> str:
    """Get custom temporary directory for streamflow."""
    custom_tmpdir = os.path.join(expanduser("~"), "tmp")
    os.makedirs(custom_tmpdir, exist_ok=True)
    return custom_tmpdir


def _setup_file_logger(log_file_path: str, workflow_id: str) -> logging.Logger:
    """Return a logger that writes to *log_file_path* with line-buffering."""
    wf_logger = logging.getLogger(f"workflow_{workflow_id}")
    wf_logger.setLevel(logging.INFO)

    # Remove any existing handlers
    for handler in wf_logger.handlers[:]:
        wf_logger.removeHandler(handler)

    file_handler = logging.FileHandler(log_file_path, mode="a")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))

    try:
        file_handler.stream.reconfigure(line_buffering=True)
    except AttributeError:
        pass  # older Python

    wf_logger.addHandler(file_handler)
    return wf_logger


def _resolve_and_guard(base_dir: str, *parts: str) -> str:
    """Join *parts* under *base_dir*, raise 403 on path-traversal."""
    base_abs = os.path.abspath(base_dir)
    full = os.path.abspath(os.path.join(base_abs, *parts))
    if os.path.commonpath([base_abs, full]) != base_abs:
        raise HTTPException(status_code=403, detail="Access denied: path traversal not allowed")
    return full


def _require_dir(path: str) -> None:
    """Raise 404 if *path* is not an existing directory."""
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Project not found")


def _find_files(root_dir: str, predicate, *, prioritize=None) -> list[str]:
    """Walk *root_dir* returning paths whose basename matches *predicate*.

    If *prioritize* is given (a callable), matching files are pushed to the
    front of the result list.
    """
    results: list[str] = []
    for root, _dirs, files in os.walk(root_dir):
        for fname in files:
            if predicate(fname):
                full = os.path.join(root, fname)
                if prioritize and prioritize(fname):
                    results.insert(0, full)
                else:
                    results.append(full)
    return results


# ---------------------------------------------------------------------------
# Workflow execution (asyncio background task)
# ---------------------------------------------------------------------------


async def _run_workflow_task(project_path: str, log_file_path: str, workflow_id: str) -> None:
    """Run ``streamflow run streamflow.yml`` in *project_path*, streaming output to logs."""
    wf_logger: logging.Logger | None = None

    try:
        wf_logger = _setup_file_logger(log_file_path, workflow_id)
        wf_logger.info("Starting workflow %s", workflow_id)
        wf_logger.info("Project path: %s", project_path)

        tmpdir = _get_custom_tmpdir()
        wf_logger.info("Using temporary directory: %s", tmpdir)

        env = os.environ.copy()
        env["TMPDIR"] = tmpdir

        cmd = ["streamflow", "run", "streamflow.yml","--outdir", "./output"]
        wf_logger.info("Running command: %s", " ".join(cmd))
        wf_logger.info("Working directory: %s", project_path)

        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=project_path,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async for raw_line in process.stdout:
            line = raw_line.decode(errors="replace").rstrip()
            wf_logger.info(line)
            for handler in wf_logger.handlers:
                if hasattr(handler, "flush"):
                    handler.flush()

        await process.wait()
        status = "completed" if process.returncode == 0 else "failed"

        if process.returncode == 0:
            wf_logger.info("Workflow %s completed successfully", workflow_id)
        else:
            wf_logger.error("Workflow %s failed with return code: %d", workflow_id, process.returncode)

        running_workflows[workflow_id] = status

    except Exception as e:
        if wf_logger is None:
            wf_logger = _setup_file_logger(log_file_path, workflow_id)
        wf_logger.error("Workflow %s failed: %s", workflow_id, e, exc_info=True)
        running_workflows[workflow_id] = "failed"
    finally:
        if wf_logger:
            for handler in wf_logger.handlers[:]:
                handler.close()
                wf_logger.removeHandler(handler)


# ---------------------------------------------------------------------------
# Endpoints - workflow catalogue
# ---------------------------------------------------------------------------


@app.get("/workflows", response_model=list[Workflow])
def get_workflows():
    return workflows_list


@app.get("/running_workflows")
def get_running_workflows_endpoint():
    """Get status of all tracked workflows."""
    return {
        "running_workflows": dict(running_workflows),
        "workflow_logs": dict(workflow_logs),
    }


@app.get("/workflow_logs/{usr}/{project_name}/{log_filename}")
def get_workflow_log_file(usr: str, project_name: str, log_filename: str):
    """Serve a log file."""
    log_path = _resolve_and_guard("./usrs_dir", usr, project_name, "logs", log_filename)
    if not os.path.isfile(log_path):
        raise HTTPException(status_code=404, detail="Log file not found")
    return FileResponse(log_path, media_type="text/plain")


@app.get("/workflow_logs_content/{usr}/{project_name}/{log_filename}")
def get_workflow_log_content(usr: str, project_name: str, log_filename: str):
    """Return log file content as JSON text (for client-side parsing)."""
    log_path = _resolve_and_guard("./usrs_dir", usr, project_name, "logs", log_filename)
    if not os.path.isfile(log_path):
        raise HTTPException(status_code=404, detail="Log file not found")
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading log file: {e}")


# @app.get("/workflows/{workflow_name}", response_model=WorkflowDetails)
# def get_workflow_details(workflow_name: str):
#     res = Workflow_Details.get(workflow_name)
#     if res is None:
#         raise HTTPException(status_code=404, detail="Workflow not found")
#     return res


# ---------------------------------------------------------------------------
# Endpoints - default projects
# ---------------------------------------------------------------------------


@app.get("/default_projects")
def list_default_projects():
    """List all available default projects."""
    if not os.path.isdir(DEFAULT_PROJECTS_DIR):
        return {"projects": [], "message": "No default projects directory found"}

    projects = []
    try:
        for item in sorted(os.listdir(DEFAULT_PROJECTS_DIR)):
            item_path = os.path.join(DEFAULT_PROJECTS_DIR, item)
            if not os.path.isdir(item_path):
                continue
            files = [
                os.path.relpath(os.path.join(root, fname), item_path).replace(os.sep, "/")
                for root, _dirs, filenames in os.walk(item_path)
                for fname in filenames
            ]
            projects.append({"name": item, "files": files})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading default projects: {e}")

    return {"projects": projects}


@app.get("/default_projects/{project_name}/files/{file_path:path}")
def get_default_project_file(project_name: str, file_path: str):
    """Download a specific file from a default project."""
    project_name = os.path.basename(project_name)
    file_path = file_path.lstrip("/")
    full_path = _resolve_and_guard(DEFAULT_PROJECTS_DIR, project_name, file_path)

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(
        path=full_path,
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(file_path),
    )


@app.get("/default_projects/{project_name}/image")
def get_default_project_image(project_name: str):
    """Get workflow diagram image for a default project."""
    project_name = os.path.basename(project_name)
    project_path = _resolve_and_guard(DEFAULT_PROJECTS_DIR, project_name)
    _require_dir(project_path)

    image_extensions = {".png", ".jpg", ".jpeg", ".svg", ".gif"}
    keyword_hints = {"workflow", "diagram", "graph", "flow", "pipeline"}

    images = _find_files(
        project_path,
        predicate=lambda f: any(f.lower().endswith(ext) for ext in image_extensions),
        prioritize=lambda f: any(kw in f.lower() for kw in keyword_hints),
    )

    if not images:
        raise HTTPException(status_code=404, detail="No workflow image found")

    mime_type, _ = mimetypes.guess_type(images[0])
    return FileResponse(
        path=images[0],
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(images[0]),
    )


@app.get("/default_projects/{project_name}/description")
def get_default_project_description(project_name: str):
    """Get workflow description (README) for a default project."""
    project_name = os.path.basename(project_name)
    project_path = _resolve_and_guard(DEFAULT_PROJECTS_DIR, project_name)
    _require_dir(project_path)

    readme_names = {"readme.md", "readme.txt", "readme", "description.md"}
    readmes = _find_files(project_path, predicate=lambda f: f.lower() in readme_names)

    if not readmes:
        return {
            "content": f"# {project_name}\n\nNo description available for this workflow.",
            "filename": "generated",
        }

    try:
        with open(readmes[0], "r", encoding="utf-8") as f:
            return {"content": f.read(), "filename": os.path.basename(readmes[0])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading description file: {e}")


@app.get("/default_projects/{project_name}/streamflow")
def get_default_project_streamflow_as_json(project_name: str):
    """Get all project files with streamflow.yml converted to JSON."""
    project_name = os.path.basename(project_name)
    project_path = _resolve_and_guard(DEFAULT_PROJECTS_DIR, project_name)
    _require_dir(project_path)

    project_files: dict = {}
    streamflow_config = None

    for root, _dirs, files in os.walk(project_path):
        for filename in files:
            file_path = os.path.join(root, filename)
            relative_path = os.path.relpath(file_path, project_path).replace(os.sep, "/")

            try:
                if filename.endswith((".yml", ".yaml")):
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = yaml.safe_load(f)
                    project_files[relative_path] = {"type": "yaml", "content": content}
                    if filename == "streamflow.yml":
                        streamflow_config = content

                elif filename.endswith(".cwl"):
                    with open(file_path, "r", encoding="utf-8") as f:
                        project_files[relative_path] = {"type": "cwl", "content": f.read()}

                elif filename.endswith((".py", ".sh")):
                    with open(file_path, "r", encoding="utf-8") as f:
                        project_files[relative_path] = {"type": "script", "content": f.read()}

                elif filename.endswith((".txt", ".md")):
                    with open(file_path, "r", encoding="utf-8") as f:
                        project_files[relative_path] = {"type": "text", "content": f.read()}

                else:
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            project_files[relative_path] = {"type": "text", "content": f.read()}
                    except UnicodeDecodeError:
                        project_files[relative_path] = {"type": "binary", "content": "Binary file - not editable"}

            except Exception as e:
                project_files[relative_path] = {"type": "error", "content": f"Error reading file: {e}"}

    return {
        "project_name": project_name,
        "streamflow_config": streamflow_config,
        "project_files": project_files,
    }


@app.get("/default_projects/{project_name}/download")
def download_default_project_archive(project_name: str):
    """Download entire default project as a ZIP archive."""
    project_name = os.path.basename(project_name)
    project_path = _resolve_and_guard(DEFAULT_PROJECTS_DIR, project_name)
    _require_dir(project_path)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp.close()

    try:
        with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(project_path):
                for fname in files:
                    full = os.path.join(root, fname)
                    zf.write(full, os.path.relpath(full, project_path))

        return FileResponse(
            path=tmp.name,
            media_type="application/zip",
            filename=f"{project_name}.zip",
            background=BackgroundTask(os.unlink, tmp.name),
        )
    except Exception as e:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail=f"Error creating archive: {e}")


@app.get("/workflow_output/{usr}/{project_name}/download")
def download_workflow_output_archive(usr: str, project_name: str):
    """Download a ZIP archive containing files from a workflow output directory."""
    usr = os.path.basename(usr)
    project_name = os.path.basename(project_name)

    output_path = _resolve_and_guard("./usrs_dir", usr, project_name, "output")
    _require_dir(output_path)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp.close()

    try:
        has_files = False
        with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(output_path):
                for fname in files:
                    has_files = True
                    full = os.path.join(root, fname)
                    zf.write(full, os.path.relpath(full, output_path))

        if not has_files:
            os.unlink(tmp.name)
            raise HTTPException(status_code=404, detail="No output files found")

        return FileResponse(
            path=tmp.name,
            media_type="application/zip",
            filename=f"{project_name}_output.zip",
            background=BackgroundTask(os.unlink, tmp.name),
        )
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail=f"Error creating output archive: {e}")


@app.get("/workflow_output/{usr}/{project_name}/list")
def list_workflow_output(usr: str, project_name: str):
    """List output directory contents for a workflow run."""
    usr = os.path.basename(usr)
    project_name = os.path.basename(project_name)

    output_path = _resolve_and_guard("./usrs_dir", usr, project_name, "output")
    _require_dir(output_path)

    entries: list[dict] = []
    seen_dirs: set[str] = set()

    for root, dirs, files in os.walk(output_path):
        rel_root = os.path.relpath(root, output_path).replace(os.sep, "/")
        if rel_root == ".":
            rel_root = ""

        for d in dirs:
            rel_dir = f"{rel_root}/{d}".lstrip("/")
            if rel_dir and rel_dir not in seen_dirs:
                seen_dirs.add(rel_dir)
                entries.append({"path": rel_dir, "is_dir": True})

        for fname in files:
            full = os.path.join(root, fname)
            rel_file = f"{rel_root}/{fname}".lstrip("/")
            try:
                st = os.stat(full)
                entries.append(
                    {
                        "path": rel_file,
                        "is_dir": False,
                        "size": st.st_size,
                        "modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
                    }
                )
            except Exception:
                entries.append({"path": rel_file, "is_dir": False})

    entries.sort(key=lambda e: (e.get("path", ""), 0 if e.get("is_dir", False) else 1))
    return {"usr": usr, "project_name": project_name, "entries": entries}


@app.get("/workflow_output/{usr}/{project_name}/files/{file_path:path}")
def download_workflow_output_file(usr: str, project_name: str, file_path: str):
    """Download a specific file from a workflow output directory."""
    usr = os.path.basename(usr)
    project_name = os.path.basename(project_name)
    file_path = file_path.lstrip("/")

    full_path = _resolve_and_guard("./usrs_dir", usr, project_name, "output", file_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(
        path=full_path,
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(file_path),
    )


# ---------------------------------------------------------------------------
# Endpoint - run workflow
# ---------------------------------------------------------------------------


@app.post("/run/{usr}/{project_name}")
async def run(usr: str, project_name: str | None, files: list[UploadFile]) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    proj_path = getDefaultProjectDir(usr, project_name)

    for elem in files:
        raw = elem.file.read()
        filename = elem.filename or "unnamed"

        if "/" in filename or "\\" in filename:
            normalized = filename.replace("\\", "/")
            dest = os.path.join(proj_path, normalized)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
        else:
            dest = os.path.join(proj_path, filename)

        with open(dest, "wb") as f:
            f.write(raw)
        logger.info("Saved file: %s", dest)

    os.makedirs(os.path.join(proj_path, "output"), exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = project_name or "unknown"
    workflow_id = f"{safe_name}_{usr}_{timestamp}"

    log_dir = os.path.join("./usrs_dir", usr, safe_name, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, f"{workflow_id}.log")

    running_workflows[workflow_id] = "running"
    workflow_logs[workflow_id] = log_file_path

    asyncio.create_task(_run_workflow_task(proj_path, log_file_path, workflow_id))

    return {
        "workflow_id": workflow_id,
        "status": "started",
        "log_file": log_file_path,
    }


# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)

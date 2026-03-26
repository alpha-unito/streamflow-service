// components/WorkflowOutput.tsx
import { useEffect, useMemo, useState } from "react"
import {
  downloadWorkflowOutput,
  downloadWorkflowOutputFile,
  fetchWorkflowOutputList,
  getCurrentUser,
  type WorkflowOutputEntry,
} from "../services/workflowService"

interface WorkflowOutputProps {
  projectName: string
  onClose: () => void
}

function formatBytes(n?: number): string {
  if (n === undefined) return ""
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function depthOf(path: string): number {
  if (!path) return 0
  return path.split("/").filter(Boolean).length - 1
}

function parentOf(path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "")
  const parts = clean.split("/").filter(Boolean)
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join("/")
}

type TreeNode = {
  path: string
  name: string
  is_dir: boolean
  size?: number
  modified?: string
  children?: TreeNode[]
}

function buildTree(entries: WorkflowOutputEntry[]): TreeNode {
  const root: TreeNode = { path: "", name: "", is_dir: true, children: [] }
  const dirByPath = new Map<string, TreeNode>([["", root]])

  const ensureDir = (dirPath: string): TreeNode => {
    const clean = dirPath.replace(/^\/+/, "").replace(/\/+$/, "")
    if (dirByPath.has(clean)) return dirByPath.get(clean)!

    const parentPath = parentOf(clean)
    const parent = ensureDir(parentPath)
    const name = clean.split("/").filter(Boolean).pop() || clean
    const node: TreeNode = { path: clean, name, is_dir: true, children: [] }
    parent.children = parent.children || []

    if (!parent.children.some((c) => c.is_dir && c.path === clean)) {
      parent.children.push(node)
    }

    dirByPath.set(clean, node)
    return node
  }

  for (const e of entries) {
    const cleanPath = e.path.replace(/^\/+/, "").replace(/\/+$/, "")
    if (!cleanPath) continue

    if (e.is_dir) {
      ensureDir(cleanPath)
      continue
    }

    const parentPath = parentOf(cleanPath)
    const parent = ensureDir(parentPath)
    const name = cleanPath.split("/").filter(Boolean).pop() || cleanPath
    parent.children = parent.children || []
    if (!parent.children.some((c) => !c.is_dir && c.path === cleanPath)) {
      parent.children.push({
        path: cleanPath,
        name,
        is_dir: false,
        size: e.size,
        modified: e.modified,
      })
    }
  }

  const sortNode = (node: TreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }

  sortNode(root)
  return root
}

export function WorkflowOutput({ projectName, onClose }: WorkflowOutputProps) {
  const [entries, setEntries] = useState<WorkflowOutputEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>())

  const username = getCurrentUser()

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!username) {
        setError("No current user selected")
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await fetchWorkflowOutputList(username, projectName)
        if (!cancelled) setEntries(res.entries || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load output")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [username, projectName])

  const filesOnly = useMemo(() => entries.filter((e: WorkflowOutputEntry) => !e.is_dir), [entries])
  const tree = useMemo(() => buildTree(entries), [entries])

  const toggleFolder = (folderPath: string) => {
    setExpanded((prev: Set<string>) => {
      const next = new Set<string>(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
        return next
      }

      // Accordion behavior: open one folder at a time per parent
      const parent = parentOf(folderPath)
      const depth = depthOf(folderPath)
      const toClose: string[] = []
      for (const p of next) {
        if (depthOf(p) === depth && parentOf(p) === parent) toClose.push(p)
      }
      toClose.forEach((p) => next.delete(p))

      next.add(folderPath)
      return next
    })
  }

  const handleDownloadZip = async () => {
    if (!username) {
      setError("No current user selected")
      return
    }

    try {
      setDownloading("__zip__")
      await downloadWorkflowOutput(username, projectName)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download output zip")
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadFile = async (path: string) => {
    if (!username) {
      setError("No current user selected")
      return
    }

    try {
      setDownloading(path)
      await downloadWorkflowOutputFile(username, projectName, path)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download file")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="mb-1">Workflow Output</h5>
          <div className="text-muted">
            <strong>Project:</strong> {projectName}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={handleDownloadZip}
            disabled={downloading !== null}
          >
            {downloading === "__zip__" ? "Downloading…" : "Download ZIP"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="alert alert-info mb-0">Loading output directory…</div>
      ) : entries.length === 0 ? (
        <div className="alert alert-warning mb-0">No output files found.</div>
      ) : (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Files</h6>
            <small className="text-muted">{filesOnly.length} file(s)</small>
          </div>
          <div className="card-body">
            <div className="list-group list-group-flush">
              {(tree.children || []).length === 0 ? (
                <div className="list-group-item px-0 text-muted">No entries.</div>
              ) : (
                (function render(nodes: TreeNode[], depth: number): any {
                  return nodes.flatMap((node) => {
                    const indentRem = depth * 1.25

                    if (node.is_dir) {
                      const isOpen = expanded.has(node.path)
                      const row = (
                        <div key={node.path} className="list-group-item px-0 text-start">
                          <div className="d-flex align-items-center gap-2 w-100" style={{ minWidth: 0 }}>
                            <span style={{ display: "inline-block", width: `${indentRem}rem` }} />
                            <i className={`bi ${isOpen ? "bi-chevron-down" : "bi-chevron-right"}`} />
                            <i className="bi bi-folder" />

                            <span
                              className="text-start"
                              style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                              title={node.path}
                            >
                              {node.name}
                            </span>

                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm py-0 px-2"
                              onClick={() => toggleFolder(node.path)}
                              disabled={downloading !== null}
                              title={isOpen ? "Hide folder contents" : "Show folder contents"}
                            >
                              {isOpen ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>
                      )

                      const children = isOpen && node.children ? render(node.children, depth + 1) : []
                      return [row, ...children]
                    }

                    const isBusy = downloading === node.path
                    return (
                      <div key={node.path} className="list-group-item px-0">
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center" style={{ minWidth: 0 }}>
                            <span style={{ display: "inline-block", width: "0rem" }} />
                            <i className="me-2 bi bi-file-earmark" />
                            <div
                              className="d-flex align-items-baseline gap-2"
                              style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
                              <small className="text-muted" style={{ flexShrink: 0 }}>
                                {formatBytes(node.size)}
                                {node.modified ? ` • ${node.modified}` : ""}
                              </small>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-outline-success btn-sm"
                            onClick={() => handleDownloadFile(node.path)}
                            disabled={downloading !== null}
                            title="Download file"
                          >
                            {isBusy ? "Downloading…" : "Download"}
                          </button>
                        </div>
                      </div>
                    )
                  })
                })(tree.children || [], 0)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

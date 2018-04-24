export const sanitizeBuild = ({ id, hostname, version, project, steps, status }) => {
  return {
    id,
    hostname,
    version,
    project,
    steps: steps.map(sanitizeStep),
    status,
  }
}

export const sanitizeStep = ({ id, name, logs, status }) => {
  return {
    id,
    name,
    logs,
    status,
  }
}

// Does nothing, but adds meanings to values
Number.seconds = (val) => val * 1000

export async function walkDirHandle(dirHandle, basePath = '') {
  const out = []
  const jobs = []
  for await (const [name, handle] of dirHandle.entries()) {
    const path = basePath ? basePath + '/' + name : name
    if (handle.kind === 'directory') {
      jobs.push(walkDirHandle(handle, path).then((sub) => out.push(...sub)))
    } else if (handle.kind === 'file') {
      const f = await handle.getFile()
      out.push({ file: f, path })
    }
  }
  await Promise.all(jobs)
  return out
}

function walkEntry(entry, path, out) {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file(
        (f) => {
          out.push({ file: f, path })
          resolve()
        },
        reject
      )
    })
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    return new Promise((resolve, reject) => {
      const loop = () =>
        reader.readEntries(
          (batch) => {
            if (!batch.length) return resolve()
            Promise.all(batch.map((e) => walkEntry(e, path + '/' + e.name, out))).then(loop, reject)
          },
          reject
        )
      loop()
    })
  }
  return Promise.resolve()
}

export async function walkItems(items) {
  const out = []
  const jobs = []
  for (const item of Array.from(items || [])) {
    if (item instanceof File) {
      out.push({ file: item, path: item.webkitRelativePath || item.name })
      continue
    }
    if (!item) continue
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry()
    if (entry) jobs.push(walkEntry(entry, entry.name, out))
    else if (item.getAsFile) {
      const f = item.getAsFile()
      if (f) out.push({ file: f, path: f.name })
    }
  }
  await Promise.all(jobs)
  return out
}

const fs = require('fs')
const path = require('path')
const util = require('util')

const rmdir = util.promisify(fs.rmdir)
const joinPath = path.join
const readdir = util.promisify(fs.readdir)
const stat = util.promisify(fs.stat)
const unlink = util.promisify(fs.unlink)

const rm = (path) =>
  stat(path)
  .then(s => s.isDirectory()
    ? rrmdir(path)
    : unlink(path)
  )

const rrmdir = async (path) =>
  readdir(path)
  .then(files => Promise.all(
    files
    .map((file) => rm(joinPath(path, file)))
  ))
  .then(() => rmdir(path))

module.exports = {
  rrmdir
}

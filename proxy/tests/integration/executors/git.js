require = require('esm')(module)
const { expect } = require('chai')
const sinon = require('sinon')
const { cloneRepo } = require('../../../src/executors/git')
const fs = require('fs')
const path = require('path')
const util = require('util')
const child_process = require('child_process')
const { rrmdir } = require('../../utils')

const exec = util.promisify(child_process.exec)
const access = util.promisify(fs.access)
const joinPath = path.join
const pathExists = (path) =>
  access(path)
  .then(_ => true, _ => false)

describe('executors/git', _ => {
  const dummyRepo = joinPath(__dirname, '..', '..', 'fixtures', 'git-repo');
  /** @var {function} Fake path function */
  let path
  /** @var {function} Spy step logger function */
  let stepLogger
  /** @var {string} Random path where dummy repo should be cloned */
  let clonePath

  beforeEach(() => {
    clonePath = `/tmp/cqa-tests/${Math.random().toString(6)}`
    path = sinon.fake.returns(clonePath)
    stepLogger = sinon.spy()
  })

  afterEach(async () => {
    if (await pathExists(clonePath)) {
      await rrmdir(clonePath)
    }
  })

  it('clones and checkouts repository when path does not exist', async () => {
    await cloneRepo(path, stepLogger, {
      project: { repoUrl: 'file://' + dummyRepo },
      version: 'v1',
    }).promise()

    expect(stepLogger.callCount).to.equal(2)
    expect(await pathExists(joinPath(clonePath, 'README.v1.md'))).to.be.true
    expect(await pathExists(joinPath(clonePath, 'README.v2.md'))).to.be.false
  })

  it('only checkouts repository when path already exists', async () => {
    // Clone the repo prior to the test
    await exec(`git clone ${dummyRepo} ${clonePath}`)

    await cloneRepo(path, stepLogger, {
      project: { repoUrl: 'file://' + dummyRepo },
      version: 'v2',
    }).promise()

    expect(stepLogger.callCount).to.equal(2)
    expect(await pathExists(joinPath(clonePath, 'README.v1.md'))).to.be.false
    expect(await pathExists(joinPath(clonePath, 'README.v2.md'))).to.be.true
  })

  // @TODO: test cleanup step
  // it('cleans up ')
})

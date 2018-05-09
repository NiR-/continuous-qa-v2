require = require('esm')(module)
const { expect } = require('chai')
const { createBuild, updateBuildStatus, createStep, updateStepStatus, addStepToBuild } = require('../../src/build')

describe('build', _ => {
  it('creates a new build', () => {
    const project = { name: 'nir-/cqa-dummy-repo' }
    const build = createBuild('build.hostname', project, 'v1')

    expect(build.id).to.not.be.empty
    expect(build.hostname).to.equal('build.hostname')
    expect(build.project).to.equal(project)
    expect(build.version).to.equal('v1')
    expect(build.status).to.equal('created')
  })

  it('updates build status', () => {
    const project = { name: 'nir-/cqa-dummy-repo' }
    const build = createBuild('build.hostname', project, 'v1')
    const updatedBuild = updateBuildStatus('failed', build)

    expect(build.equals(updatedBuild)).to.be.false
  })

  it('creates a new step', () => {
    const step = createStep('some.step')

    expect(step.id).to.not.be.empty
    expect(step.name).to.equal('some.step')
    expect(step.status).to.equal('running')
  })

  it('updates step status', () => {
    const step = createStep('some.step')
    const updated = updateStepStatus('succeeded', step)

    expect(updated.status).to.equal('succeeded')
  })

  it('adds step to build', () => {
    const project = { name: 'nir-/cqa-dummy-repo' }
    const build = createBuild('build.hostname', project, 'v1')
    const step = createStep('some.step')

    expect(build.steps.length).to.equal(0)
    addStepToBuild(build, step)
    expect(build.steps.length).to.equal(1)
  })
})

require = require('esm')(module)
const { expect } = require('chai')
const sinon = require('sinon')
const { onBuildCreated  } = require('../../src/build-workflow')

describe('build-workflow', () => {
  let logger, storeBuild, executeBuild

  beforeEach(() => {
    logger = spy.sinon()
    storeBuild = spy.sinon()
    executeBuild = spy.sinon()
  })

  it('runs the build when it\'s been created', () => {
    const project = { name: 'nir-/cqa-dummy-repo' }
    const build = createBuild('some.hostname', project, 'v1')

    const future = onBuildCreated(logger, storeBuild, executeBuild, { build })
    const updated = future.value()

    expect(updated.)
  })
})

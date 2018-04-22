require = require('esm')(module)
const { splitHostname } = require('../../src/http')
const { expect } = require('chai');

describe('http', () => {
  [
    {
      description: 'basic case',
      hostname: 'v1.cqa-dummy-repo.nir.cqa',
      baseDomain: 'cqa',
      expected: { projectName: 'nir/cqa-dummy-repo', version: 'v1' },
    },
    {
      description: 'with a dot in the base domain',
      hostname: 'v1.cqa-dummy-repo.nir.cqa.com',
      baseDomain: 'cqa.com',
      expected: { projectName: 'nir/cqa-dummy-repo', version: 'v1' },
    },
    {
      description: 'with a dot in the middle of each component',
      hostname: 'he--dot--ho.cqa--dot--dummy--dot--repo.dat--dot--name.cqa',
      baseDomain: 'cqa',
      expected: { projectName: 'dat.name/cqa.dummy.repo', version: 'he.ho' },
    },
    {
      description: 'with a trailing hyphen at the end of each component',
      hostname: 'yolo--hyphen.cqa-dummy-repo--hyphen.nir--hyphen.cqa',
      baseDomain: 'cqa',
      expected: { projectName: 'nir-/cqa-dummy-repo-', version: 'yolo-' },
    },
    {
      description: 'with a trailing dot at the end of each component',
      hostname: 'yolo--dot.cqa-dummy-repo--dot.nir--dot.cqa',
      baseDomain: 'cqa',
      expected: { projectName: 'nir./cqa-dummy-repo.', version: 'yolo.' },
    },
    {
      description: 'with a slash in the version',
      hostname: 'compose--slash--v1.cqa-dummy-repo.nir.cqa',
      baseDomain: 'cqa',
      expected: { projectName: 'nir/cqa-dummy-repo', version: 'compose/v1' },
    },
  ].map(({ description, hostname, baseDomain, expected }) => {
    it(`splits hostname - ${description}`, () => {
      const { projectName, version } = splitHostname(baseDomain, hostname);

      expect(projectName).to.equal(expected.projectName);
      expect(version).to.equal(expected.version);
    })
  })
})

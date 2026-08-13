import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  ensureCiConfigs,
  generateEasWorkflow,
  generateGithubActionsWorkflow,
  generateAzurePipeline,
  generateGitlabCi,
  generateBitbucketPipelines,
  detectCiProvider,
  detectCiProviderFromEnv,
} from '../../src/adapters/ciTemplates'
import { createTempProject, cleanup } from '../helpers/tmp'

const RN_PKG = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    scripts: {
      lint: 'eslint src',
      typecheck: 'tsc --noEmit',
      test: 'jest',
      'prettier:check': 'prettier --check .',
    },
    dependencies: { 'react-native': '0.72.0' },
    devDependencies: { jest: '29.7.0' },
  }),
}

const EXPO_PKG = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    scripts: {
      lint: 'expo lint',
      test: 'jest',
    },
    dependencies: { expo: '~52.0.0' },
  }),
}

describe('ciTemplates', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  describe('generateGithubActionsWorkflow', () => {
    it('maps the detected scripts and package manager into steps', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      writeFileSync(join(dir, 'yarn.lock'), '')

      const workflow = generateGithubActionsWorkflow(dir)
      expect(workflow).toContain('name: vectalon-ci')
      expect(workflow).toContain('on:')
      expect(workflow).toContain('pull_request:')
      expect(workflow).toContain('runs-on: ubuntu-latest')
      expect(workflow).toContain('actions/checkout@v4')
      expect(workflow).toContain('cache: yarn')
      expect(workflow).toContain('yarn install --immutable')
      expect(workflow).toContain('corepack enable')
      expect(workflow).toContain('yarn lint')
      expect(workflow).toContain('yarn typecheck')
      expect(workflow).toContain('yarn prettier:check')
      expect(workflow).toContain('yarn test')
    })

    it('files a CI incident when a quality step fails', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateGithubActionsWorkflow(dir)
      expect(workflow).toContain('File CI incident')
      expect(workflow).toContain('if: failure()')
      expect(workflow).toContain('ci-incident --gate quality')
    })

    it('emits native checks (pod install / gradle) as a second job', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      mkdirSync(join(dir, 'ios'), { recursive: true })
      writeFileSync(join(dir, 'ios', 'Podfile'), '# pods')
      mkdirSync(join(dir, 'android'), { recursive: true })
      writeFileSync(join(dir, 'android', 'gradlew'), '#!/bin/sh')

      const workflow = generateGithubActionsWorkflow(dir)
      expect(workflow).toContain('jobs:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('  native:')
      expect(workflow).toContain('pod install')
      expect(workflow).toContain('./gradlew clean')
      expect(workflow).toContain('ci-incident --gate native')
    })
  })

  describe('generateEasWorkflow', () => {
    it('generates a .eas/workflows YAML with steps for an Expo project', () => {
      for (const [name, content] of Object.entries(EXPO_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const workflow = generateEasWorkflow(dir)
      expect(workflow).toContain('name: vectalon-ci')
      expect(workflow).toContain('jobs:')
      expect(workflow).toContain('  quality:')
      expect(workflow).toContain('- run: npm ci')
      expect(workflow).toContain('- run: npm run lint')
      expect(workflow).toContain('- run: npm run test')
      expect(workflow).toContain('on:')
      expect(workflow).toContain('pull_request:')
    })
  })

  describe('detectCiProvider', () => {
    it('detects the CI host from the git remote URL', () => {
      const writeGitConfig = (url: string) => {
        mkdirSync(join(dir, '.git'), { recursive: true })
        writeFileSync(join(dir, '.git', 'config'), `[remote "origin"]\n\turl = ${url}\n`)
      }

      writeGitConfig('ssh.dev.azure.com:v3/getgenea/OTHVAC-Mobile/OTHVAC-Mobile')
      expect(detectCiProvider(dir)).toBe('azure')
      writeGitConfig('https://dev.azure.com/org/project/_git/repo')
      expect(detectCiProvider(dir)).toBe('azure')
      writeGitConfig('git@gitlab.com:org/repo.git')
      expect(detectCiProvider(dir)).toBe('gitlab')
      writeGitConfig('git@bitbucket.org:org/repo.git')
      expect(detectCiProvider(dir)).toBe('bitbucket')
      writeGitConfig('git@github.com:org/repo.git')
      expect(detectCiProvider(dir)).toBe('github')
    })

    it('falls back to github when there is no git remote and no CI env', () => {
      expect(detectCiProvider(dir)).toBe('github')
    })
  })

  describe('detectCiProviderFromEnv', () => {
    const envKeys = ['SYSTEM_TEAMPROJECT', 'GITLAB_CI', 'BITBUCKET_PIPELINES', 'GITHUB_ACTIONS']
    const saved: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of envKeys) {
        saved[key] = process.env[key]
        delete process.env[key]
      }
    })

    afterEach(() => {
      for (const key of envKeys) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    })

    it('maps each provider env marker to its CI host', () => {
      process.env.SYSTEM_TEAMPROJECT = 'OTHVAC-Mobile'
      expect(detectCiProviderFromEnv()).toBe('azure')
      delete process.env.SYSTEM_TEAMPROJECT

      process.env.GITLAB_CI = 'true'
      expect(detectCiProviderFromEnv()).toBe('gitlab')
      delete process.env.GITLAB_CI

      process.env.BITBUCKET_PIPELINES = 'true'
      expect(detectCiProviderFromEnv()).toBe('bitbucket')
      delete process.env.BITBUCKET_PIPELINES

      process.env.GITHUB_ACTIONS = 'true'
      expect(detectCiProviderFromEnv()).toBe('github')
    })

    it('returns null with no provider markers', () => {
      expect(detectCiProviderFromEnv()).toBeNull()
    })

    it('detects the host from env when the checkout has no git remote', () => {
      process.env.GITLAB_CI = 'true'
      expect(detectCiProvider(dir)).toBe('gitlab')
    })
  })

  describe('generateAzurePipeline', () => {
    it('emits an Azure Pipelines workflow with PR triggers and incident hook', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateAzurePipeline(dir)
      expect(workflow).toContain('trigger: none')
      expect(workflow).toContain('pr:')
      expect(workflow).toContain('vmImage: ubuntu-latest')
      expect(workflow).toContain('NodeTool@0')
      expect(workflow).toContain('npm run lint')
      expect(workflow).toContain('ci-incident --gate quality')
      expect(workflow).toContain('condition: failed()')
      expect(workflow).toContain('$(Build.SourceVersion)')
      expect(workflow).toContain('$(System.PullRequest.SourceBranch)')
      expect(workflow).toContain('- job: visual')
      expect(workflow).toContain('$(System.PullRequest.TargetBranch)')
    })

    it('passes the PR id and Azure token to the visual job for comment posting', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateAzurePipeline(dir)
      expect(workflow).toContain('visual-ci --pr $(System.PullRequest.PullRequestId)')
      expect(workflow).toContain('--push')
      expect(workflow).toContain('AZURE_DEVOPS_TOKEN: $(System.AccessToken)')
    })
  })

  describe('generateGitlabCi', () => {
    it('emits a GitLab CI with merge-request workflow and on_failure incident job', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateGitlabCi(dir)
      expect(workflow).toContain('stages:')
      expect(workflow).toContain('merge_request_event')
      expect(workflow).toContain('image: node:20')
      expect(workflow).toContain('npm run lint')
      expect(workflow).toContain('when: on_failure')
      expect(workflow).toContain('ci-incident --gate quality')
      expect(workflow).toContain('$CI_COMMIT_SHA')
      expect(workflow).toContain('$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME')
      expect(workflow).toContain('tags:')
      expect(workflow).toContain('allow_failure: true')
      expect(workflow).toContain('$CI_MERGE_REQUEST_TARGET_BRANCH_NAME')
    })

    it('passes the MR iid and GitLab token to the visual job for comment posting', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateGitlabCi(dir)
      expect(workflow).toContain('visual-ci --pr $CI_MERGE_REQUEST_IID')
      expect(workflow).toContain('--push')
      expect(workflow).toContain('GITLAB_TOKEN: $GITLAB_TOKEN')
    })
  })

  describe('generateBitbucketPipelines', () => {
    it('emits a Bitbucket Pipelines pull-request pipeline', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflow = generateBitbucketPipelines(dir)
      expect(workflow).toContain('pipelines:')
      expect(workflow).toContain('pull-requests:')
      expect(workflow).toContain('image: node:20')
      expect(workflow).toContain('npm run lint')
      expect(workflow).toContain('caches:')
    })
  })

  describe('ensureCiConfigs', () => {
    it('writes the GitHub Actions workflow for bare RN CLI projects', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const result = ensureCiConfigs(dir, { isExpo: false })
      expect(result).toEqual([{ path: '.github/workflows/vectalon-ci.yml', written: true }])
      expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(true)
      expect(readFileSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'), 'utf-8')).toContain('name: vectalon-ci')
    })

    it('writes the EAS workflow for Expo projects', () => {
      for (const [name, content] of Object.entries(EXPO_PKG)) {
        writeFileSync(join(dir, name), content)
      }

      const result = ensureCiConfigs(dir, { isExpo: true })
      expect(result[0].path).toBe('.eas/workflows/vectalon.yml')
      expect(result[0].written).toBe(true)
      expect(existsSync(join(dir, '.eas', 'workflows', 'vectalon.yml'))).toBe(true)
    })

    it('never overwrites an existing workflow', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      const workflowPath = join(dir, '.github', 'workflows', 'vectalon-ci.yml')
      mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
      writeFileSync(workflowPath, '# user authored workflow')

      const result = ensureCiConfigs(dir, { isExpo: false })
      expect(result[0].written).toBe(false)
      expect(readFileSync(workflowPath, 'utf-8')).toBe('# user authored workflow')
    })

    it('writes the Azure Pipelines workflow when an azure remote is detected', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      mkdirSync(join(dir, '.git'), { recursive: true })
      writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = ssh.dev.azure.com:v3/org/proj/repo\n')

      const result = ensureCiConfigs(dir, { isExpo: false })
      expect(result[0].path).toBe('azure-pipelines.yml')
      expect(existsSync(join(dir, 'azure-pipelines.yml'))).toBe(true)
      expect(readFileSync(join(dir, 'azure-pipelines.yml'), 'utf-8')).toContain('trigger: none')
    })

    it('honors an explicit provider override over remote detection', () => {
      for (const [name, content] of Object.entries(RN_PKG)) {
        writeFileSync(join(dir, name), content)
      }
      mkdirSync(join(dir, '.git'), { recursive: true })
      writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:org/repo.git\n')

      const result = ensureCiConfigs(dir, { isExpo: false, provider: 'gitlab' })
      expect(result[0].path).toBe('.gitlab-ci.yml')
      expect(existsSync(join(dir, '.gitlab-ci.yml'))).toBe(true)
    })
  })
})

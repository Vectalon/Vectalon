import { WireframeGenerator } from '../../src/sdlc/WireframeGenerator'

describe('WireframeGenerator', () => {
  it('renders an ASCII wireframe with section rows', () => {
    const wf = new WireframeGenerator().generate('Login', ['header', 'input', 'button', 'footer'])
    expect(wf).toContain('Login')
    expect(wf).toContain('HEADER')
    expect(wf).toContain('INPUT')
    expect(wf).toContain('BUTTON')
    expect(wf).toContain('FOOTER')
    expect(wf).toContain('+---')
  })

  it('supports explicit section labels', () => {
    const wf = new WireframeGenerator().generate('Login', [{ type: 'button', label: 'Sign In' }])
    expect(wf).toContain('Sign In')
  })

  it('defaults unknown section types to text', () => {
    const wf = new WireframeGenerator().generate('X', ['wibble'])
    expect(wf).toContain('TEXT')
  })

  it('parses type:label section strings and honours header type', () => {
    const wf = new WireframeGenerator().generate('Login', ['header', 'input:Email Address'])
    expect(wf).toContain('HEADER header')
    expect(wf).toContain('Email Address')
    expect(wf).not.toContain('TEXT header')
  })

  it('provides a default layout with hero and list', () => {
    const wf = new WireframeGenerator().renderDefault('Home')
    expect(wf).toContain('HERO')
    expect(wf).toContain('LIST')
    expect(wf).toContain('FOOTER')
  })
})

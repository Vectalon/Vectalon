import type { DesignAdapter, MotionRecommendation } from './types'

export class MotionDesignAdapter implements DesignAdapter {
  name = 'motion-design'

  async analyzeMotion(designSpec: string): Promise<MotionRecommendation[]> {
    const recommendations: MotionRecommendation[] = []

    if (/button|cta|press|tap|touch/i.test(designSpec)) {
      recommendations.push({
        element: 'Buttons / CTAs',
        intent: 'Confirm user action and provide tactile feedback',
        primaryProperty: 'scale',
        secondaryProperties: ['shadow', 'opacity'],
        duration: 150,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        personality: 'corporate',
        notes: 'Press: scale 0.97 (50ms), release: scale 1.0 with subtle shadow restore (100ms).',
      })
    }

    if (/card|enter|exit|list|screen|modal|dialog/i.test(designSpec)) {
      recommendations.push({
        element: 'Cards / Screens / Modals',
        intent: 'Create spatial awareness during context switches',
        primaryProperty: 'position',
        secondaryProperties: ['opacity', 'scale'],
        duration: /modal|dialog/i.test(designSpec) ? 350 : 250,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        personality: 'premium',
        notes: 'Enter from 20px below with opacity 0. Exit with ease-in acceleration. Keep motion under 1/3 of screen.',
      })
    }

    if (/loading|spinner|progress|skeleton/i.test(designSpec)) {
      recommendations.push({
        element: 'Loading / Skeleton',
        intent: 'Indicate progress without blocking perceived responsiveness',
        primaryProperty: 'opacity',
        secondaryProperties: ['scale'],
        duration: 800,
        easing: 'ease-in-out',
        personality: 'corporate',
        notes: 'Skeleton pulse: opacity 0.4 -> 1.0 in 800ms loops. Spinner: continuous rotation with linear easing.',
      })
    }

    if (/success|check|complete|done/i.test(designSpec)) {
      recommendations.push({
        element: 'Success states',
        intent: 'Celebrate completion and reassure the user',
        primaryProperty: 'scale',
        secondaryProperties: ['color', 'rotation'],
        duration: 350,
        easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        personality: 'playful',
        notes: 'Scale pop with ease-out-back. Checkmark draws in 150ms after the pop.',
      })
    }

    if (/error|alert|shake|warning/i.test(designSpec)) {
      recommendations.push({
        element: 'Error / Alert',
        intent: 'Signal a problem clearly and firmly',
        primaryProperty: 'position',
        secondaryProperties: ['color'],
        duration: 350,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        personality: 'corporate',
        notes: 'Horizontal shake 2-3 oscillations (±10px). Red tint applied simultaneously. No overshoot.',
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        element: 'General UI',
        intent: 'Provide smooth, professional feedback',
        primaryProperty: 'opacity',
        secondaryProperties: ['position'],
        duration: 200,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        personality: 'premium',
        notes: 'Use the minimum properties needed. Maintain consistent timing across the feature.',
      })
    }

    return recommendations
  }
}

export function createDesignAdapter(config: Record<string, unknown>): DesignAdapter {
  const provider = (config.provider as string) || 'motion-design'
  if (provider === 'motion-design') {
    return new MotionDesignAdapter()
  }
  return new MotionDesignAdapter()
}

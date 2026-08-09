#!/usr/bin/env node

export function main(argv: string[] = process.argv.slice(2)): number {
  const [command, ...rest] = argv
  switch (command) {
    case 'greet':
      console.log(`Hello, ${rest[0] || 'world'}!`)
      return 0
    case 'version':
      console.log('cli-app 1.0.0')
      return 0
    case 'help':
      console.log('Usage: cli-app <greet|version|help> [name]')
      return 0
    default:
      console.log('Unknown command: ' + (command || '(none)'))
      console.log('Usage: cli-app <greet|version|help> [name]')
      return 1
  }
}

if (require.main === module) {
  process.exit(main())
}

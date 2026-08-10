// Demo fixture: `vectalon render` renders the entry's default export, so this
// one-line wrapper lets the headless sandbox render the generated screen
// (which uses a named export). tsconfig deliberately compiles only the
// scaffold CLI, so this file never affects `npm run typecheck`.
import { AddGreetCommandScreen } from './screens/AddGreetCommandScreen'

export default AddGreetCommandScreen

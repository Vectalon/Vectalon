# Implementation

## Request not classified

The request could not be confidently classified by the model, so no files were created or modified.

Request: `Create a login screen`

### Why this happened
- The local model returned an unrecognized response for intent detection, or
- The request is ambiguous (mixes adding a feature with removing a dependency, etc.), or
- The model is too small / uncalibrated for this phrasing.

### How to proceed
- Reword the request with an explicit verb: "Add a login screen", "Remove the appcenter dependency", "Fix lint issues", "Refactor the home screen".
- Run with a remote model: `vectalon feature --model openai "<request>"` (needs an API key).
- Describe the change you want as a single intent.
### Project conventions applied
- TypeScript: No
- React Navigation: No
- StyleSheet usage: No
// Resolve Expo's lazy globals while Jest permits imports, before environment teardown.
for (const name of [
  'TextDecoderStream', 'TextEncoderStream', 'URL', 'URLSearchParams',
  'DOMException', '__ExpoImportMetaRegistry', 'structuredClone', 'fetch',
]) {
  void globalThis[name];
}

const loadedFiles = new Set(['.env', '.env.local', '.env.production', '.env.production.local'])

// This release uses a settings-free local build. Live secrets belong on the host.
// Intentional build-time customization needs an explicit reviewed build profile.
export function assessHostingEnvironment({ files, env, settingNames }) {
  const issues = files.filter(file => loadedFiles.has(file))
    .map(file => `Build can load ${file}; use a settings-free build checkout.`)
  const names = new Set(settingNames)
  for (const key of Object.keys(env)) {
    if (key === 'NODE_ENV') {
      if (env[key] !== 'production') issues.push('NODE_ENV must be unset or production.')
    } else if (names.has(key) || /^(NEXT_PUBLIC_|FACEID_TEST_|__NEXT_PROCESSED_ENV$|NODE_OPTIONS$)/.test(key)) {
      issues.push(`Inherited setting ${key} is not allowed for this hosting build.`)
    }
  }
  return issues
}

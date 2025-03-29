import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const customConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: [
    '<rootDir>/src/tests/test-env.setup.ts',
    '<rootDir>/src/tests/jest.setup.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  testPathIgnorePatterns: [
    '/node_modules/', 
    '/.next/'
  ],
  transform: {
    '^.+\\.tsx?$': 'babel-jest'
  },
  testMatch: [
    '<rootDir>/src/**/*.test.[jt]s?(x)',
    '<rootDir>/test/**/*.test.[jt]s?(x)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react|@radix-ui|class-variance-authority)/)'
  ]
}

export default async () => {
  const nextJestConfig = await createJestConfig(customConfig)()
  return {
    ...nextJestConfig,
    transformIgnorePatterns: [
      'node_modules/(?!(lucide-react|@radix-ui|class-variance-authority)/)'
    ],
    moduleNameMapper: {
      ...nextJestConfig.moduleNameMapper,
      '^@/(.*)$': '<rootDir>/src/$1'
    }
  }
}

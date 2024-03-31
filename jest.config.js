module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['html', 'text'],
  coverageDirectory: './reports/coverage',
}

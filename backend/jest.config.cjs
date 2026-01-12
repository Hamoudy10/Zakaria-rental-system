module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: ['controllers/**/*.js', 'services/**/*.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
};
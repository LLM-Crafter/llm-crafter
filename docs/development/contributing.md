# Contributing Guide

Thank you for your interest in contributing to LLM Crafter! This guide will help you get started with contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Issue Guidelines](#issue-guidelines)
- [Feature Requests](#feature-requests)
- [Testing](#testing)
- [Documentation](#documentation)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **MongoDB** (v6 or higher)
- **Git**

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/your-username/llm-crafter.git
cd llm-crafter
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/original-owner/llm-crafter.git
```

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/llm-crafter-dev

# JWT
JWT_SECRET=your-jwt-secret-key

# OpenAI (for testing)
OPENAI_API_KEY=your-openai-api-key

# Server
PORT=3000
NODE_ENV=development
```

### 3. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 4. Run the Application

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

### 5. Documentation Development

To work on documentation:

```bash
npm run docs:dev
```

The documentation site will be available at `http://localhost:5173`.

## Code Style

We use ESLint and Prettier to maintain consistent code style.

### ESLint Configuration

Our ESLint configuration enforces:

- ES6+ features
- Node.js best practices
- Consistent spacing and formatting
- Error prevention patterns

### Running Linting

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors (where possible)
npm run lint -- --fix
```

### Prettier Configuration

Format your code before committing:

```bash
# Format all files
npx prettier --write .

# Format specific files
npx prettier --write src/**/*.js
```

### Recommended VS Code Extensions

- ESLint
- Prettier
- MongoDB for VS Code
- Thunder Client (for API testing)

## Submitting Changes

### Branch Naming

Use descriptive branch names:

```bash
# Feature branches
feature/add-agent-templates
feature/improve-tool-validation

# Bug fixes
fix/conversation-memory-leak
fix/api-key-validation

# Documentation
docs/api-reference-update
docs/contributing-guide
```

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```bash
feat(agents): add support for custom agent templates
fix(auth): resolve JWT token expiration issue
docs(api): update authentication endpoint documentation
test(tools): add unit tests for tool validation
```

### Pull Request Process

1. **Update your fork:**

   ```bash
   git checkout main
   git pull upstream main
   git push origin main
   ```

2. **Create a feature branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes:**

   - Write clean, documented code
   - Add tests for new functionality
   - Update documentation as needed

4. **Test your changes:**

   ```bash
   npm test
   npm run lint
   ```

5. **Commit your changes:**

   ```bash
   git add .
   git commit -m "feat(scope): descriptive message"
   ```

6. **Push to your fork:**

   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request:**
   - Use a descriptive title
   - Fill out the PR template
   - Link any related issues
   - Add screenshots for UI changes

### Pull Request Template

```markdown
## Description

Brief description of the changes.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist

- [ ] My code follows the style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
```

## Issue Guidelines

### Reporting Bugs

When reporting bugs, please include:

1. **Environment Information:**

   - Node.js version
   - npm version
   - Operating system
   - MongoDB version

2. **Steps to Reproduce:**

   - Clear, numbered steps
   - Expected behavior
   - Actual behavior

3. **Additional Context:**
   - Error logs
   - Screenshots
   - Configuration details

### Bug Report Template

```markdown
## Bug Description

A clear and concise description of what the bug is.

## Environment

- Node.js version:
- npm version:
- OS:
- MongoDB version:

## Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

A clear description of what you expected to happen.

## Actual Behavior

A clear description of what actually happened.

## Screenshots

If applicable, add screenshots to help explain your problem.

## Additional Context

Add any other context about the problem here.
```

## Feature Requests

We welcome feature requests! Please use the following template:

```markdown
## Feature Description

A clear and concise description of the feature you'd like to see.

## Problem Statement

What problem does this feature solve?

## Proposed Solution

Describe the solution you'd like.

## Alternatives Considered

Describe any alternative solutions you've considered.

## Additional Context

Add any other context or screenshots about the feature request.
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

We use Jest for testing. Test files should be placed in the same directory as the code being tested, with a `.test.js` suffix.

```javascript
// Example test file: src/services/agentService.test.js
const { createAgent, validateAgent } = require("./agentService");

describe("AgentService", () => {
  describe("createAgent", () => {
    it("should create a new agent with valid data", async () => {
      const agentData = {
        name: "Test Agent",
        type: "chatbot",
        system_prompt: "You are a helpful assistant",
      };

      const agent = await createAgent(agentData);
      expect(agent).toBeDefined();
      expect(agent.name).toBe("Test Agent");
    });
  });
});
```

### Test Categories

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test API endpoints and database interactions
- **End-to-End Tests**: Test complete user workflows

## Documentation

### Documentation Standards

- Use clear, concise language
- Include code examples
- Provide practical use cases
- Keep documentation up-to-date with code changes

### API Documentation

API documentation is generated from JSDoc comments:

```javascript
/**
 * Create a new agent
 * @param {Object} agentData - The agent configuration
 * @param {string} agentData.name - The agent name
 * @param {string} agentData.type - The agent type
 * @param {string} agentData.system_prompt - The system prompt
 * @returns {Promise<Object>} The created agent
 */
async function createAgent(agentData) {
  // Implementation
}
```

### Building Documentation

```bash
# Build documentation
npm run docs:build

# Preview built documentation
npm run docs:preview
```

## Code Architecture

### Project Structure

```
src/
├── app.js              # Application entry point
├── config/             # Configuration files
├── controllers/        # Route controllers
├── middleware/         # Express middleware
├── models/            # Mongoose models
├── routes/            # API routes
└── services/          # Business logic
```

### Design Principles

1. **Separation of Concerns**: Keep business logic separate from HTTP handling
2. **Single Responsibility**: Each module should have one clear purpose
3. **Dependency Injection**: Use dependency injection for testability
4. **Error Handling**: Implement comprehensive error handling
5. **Validation**: Validate all inputs at the boundary

### Adding New Features

When adding new features:

1. **Models**: Create/update Mongoose schemas
2. **Services**: Implement business logic
3. **Controllers**: Handle HTTP requests/responses
4. **Routes**: Define API endpoints
5. **Tests**: Add comprehensive test coverage
6. **Documentation**: Update API docs and guides

## Getting Help

### Communication Channels

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check existing docs first

### Development Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/en/guide/)
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [Jest Testing Framework](https://jestjs.io/docs/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)

## License

By contributing to LLM Crafter, you agree that your contributions will be licensed under the MIT License.

# SDK Development & Publishing Guide

## Development

### Building the SDK
```bash
# From root
npm run sdk:build

# Or from SDK directory
cd packages/js-sdk
npm run build
```

### Testing the SDK
```bash
# Run tests
npm run sdk:test

# Test the built package
cd packages/js-sdk
npm run test:package
```

### Development workflow
```bash
# Watch mode for development
npm run sdk:dev
```

## Publishing

### Pre-publish checklist
1. ✅ Tests pass: `npm run sdk:test`
2. ✅ Build successful: `npm run sdk:build`
3. ✅ Package test works: `cd packages/js-sdk && npm run test:package`
4. ✅ Version updated in `package.json`
5. ✅ README is up to date

### Dry run
```bash
cd packages/js-sdk
npm run pack:test
```

### Publishing to npm
```bash
cd packages/js-sdk

# Login to npm (if not already)
npm login

# Publish
npm publish --access public
```

### Publishing workflow
1. Update version: `npm version patch|minor|major`
2. Build: `npm run build`
3. Test: `npm run test && npm run test:package`
4. Publish: `npm publish --access public`

## Usage after publishing

### Installation
```bash
npm install @llm-crafter/sdk
```

### Node.js usage
```javascript
import { LLMCrafterClient } from '@llm-crafter/sdk';
// or
const { LLMCrafterClient } = require('@llm-crafter/sdk');

const client = new LLMCrafterClient('your-api-key', 'https://your-domain.com/api/v1');
await client.testConnection();
```

### Browser usage
```html
<script src="https://unpkg.com/@llm-crafter/sdk/dist/index.umd.js"></script>
<script>
  const client = new LLMCrafterSDK.LLMCrafterClient('your-api-key', 'https://your-domain.com/api/v1');
</script>
```

## File structure

```
packages/js-sdk/
├── src/
│   └── index.js          # Source code
├── dist/                 # Built files (published)
│   ├── index.js          # CommonJS build
│   ├── index.esm.js      # ES Module build
│   ├── index.umd.js      # UMD build (browser)
│   └── index.d.ts        # TypeScript definitions
├── tests/
│   ├── simple-test.js    # Test suite
│   └── setup.js          # Test setup
├── examples/             # Usage examples
├── package.json          # Package configuration
├── README.md             # SDK documentation
├── LICENSE               # License file
├── rollup.config.js      # Build configuration
└── .npmignore            # Files to exclude from npm
```

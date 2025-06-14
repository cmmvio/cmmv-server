# Guidelines for AI contributors

## Development
- Install dependencies with `pnpm install`.
- Use Node.js v20 or higher.
- Code lives in the `packages` folder and is written in TypeScript.
- Avoid editing compiled output in `dist` or `node_modules`.

## Testing & Linting
- Run `pnpm run lint` to check code style.
- Run `pnpm test` to execute unit tests.
- Ensure tests pass before committing.

## Building
- Use `pnpm run build` to compile all packages.


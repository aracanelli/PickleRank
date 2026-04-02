# Contributing to PickleRank

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/PickleRank.git`
3. Create a feature branch: `git checkout -b feature/your-feature`
4. Set up your environment (see [README.md](README.md#environment-setup))

## Development Workflow

1. Make your changes on a feature branch
2. Write or update tests as needed
3. Ensure linting passes:
   - Backend: `cd backend && ruff check . && ruff format --check .`
   - Frontend: `cd frontend && npm run lint`
4. Ensure tests pass:
   - Backend: `cd backend && pytest`
   - Frontend: `cd frontend && npm run test`
5. Commit with a clear message describing the change
6. Push to your fork and open a pull request

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Link any related issues
- Ensure CI checks pass before requesting review

## Code Style

- **Python (backend):** Follows [Ruff](https://docs.astral.sh/ruff/) rules configured in `pyproject.toml`
- **TypeScript/Vue (frontend):** Follows ESLint rules configured in `eslint.config.js`

## Reporting Bugs

Open an issue using the **Bug Report** template. Include steps to reproduce, expected behavior, and actual behavior.

## Suggesting Features

Open an issue using the **Feature Request** template. Describe the problem you're solving and your proposed solution.

## Questions?

Open a discussion or reach out via issues. We're happy to help!
